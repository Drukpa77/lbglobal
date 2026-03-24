import fs from "node:fs/promises";
import path from "node:path";

import type {
  DocumentCategory,
  Prisma,
  TaskPriority,
  TaskStatus,
  VisaStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { SectionNav } from "@/components/section-nav";
import { StudentNoteItem } from "@/components/student-note-item";
import { SubmitButton } from "@/components/submit-button";
import { auth } from "@/auth";
import { calculateInvoiceTotals, normalizeInvoiceItems } from "@/lib/invoice-calculator";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/template-renderer";
import { formatVisaStatus, formatYearsLeft, visaStatuses } from "@/lib/student-tracking";

type Params = Promise<{ studentId: string }>;

const studentAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
});

const allowedDocumentMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export default async function StudentProfileManagementPage(props: { params: Params }) {
  const { studentId } = await props.params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });

    if (!assigned) {
      redirect("/dashboard/sub-admin");
    }
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: {
          userId: studentId,
        },
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect("/dashboard/internal-staff");
    }
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "USER" },
    include: {
      studentProfile: true,
    },
  });

  if (!student) {
    redirect("/dashboard");
  }

  const latestSubmission = await prisma.questionnaireSubmission.findFirst({
    where: { studentId },
    include: { template: true, assignedSubAdmin: true },
    orderBy: { submittedAt: "desc" },
  });

  const [
    internalStaffUsers,
    currentAssignments,
    tasks,
    documents,
    templates,
    contracts,
    invoices,
    conversation,
    recentMessages,
    activityLogs,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: "INTERNAL_STAFF" },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.studentAssignment.findMany({
      where: { studentProfileId: student.studentProfile?.id ?? "__none__", isActive: true },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        assignedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { studentProfileId: student.studentProfile?.id ?? "__none__" },
      include: { assignee: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.studentDocument.findMany({
      where: { studentProfileId: student.studentProfile?.id ?? "__none__" },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.emailTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.contract.findMany({
      where: { studentProfileId: student.studentProfile?.id ?? "__none__" },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.invoice.findMany({
      where: { studentProfileId: student.studentProfile?.id ?? "__none__" },
      include: {
        lineItems: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.conversation.findFirst({
      where: { studentProfileId: student.studentProfile?.id ?? "__none__", type: "STUDENT_THREAD" },
      select: { id: true, title: true },
    }),
    prisma.message.findMany({
      where: {
        conversation: {
          studentProfileId: student.studentProfile?.id ?? "__none__",
          type: "STUDENT_THREAD",
        },
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.activityLog.findMany({
      where: { targetStudentProfileId: student.studentProfile?.id ?? "__none__" },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const submissionAnswers = getAnswerEntries(latestSubmission?.answers);
  const backLink =
    session.user.role === "ADMIN"
      ? "/dashboard/admin"
      : session.user.role === "SUB_ADMIN"
        ? "/dashboard/sub-admin"
        : "/dashboard/internal-staff";
  const profile = student.studentProfile;

  return (
    <section className="space-y-8 text-slate-900">
      <Breadcrumbs
        items={[
          { label: "My Dashboard", href: backLink },
          { label: student.name ?? student.email },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Profile</h1>
          <p className="mt-1 text-base text-slate-600">
            {student.name ?? student.email}
          </p>
        </div>
        <Link
          href={backLink}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          ← Back to dashboard
        </Link>
      </div>

      <SectionNav />

      <section id="overview" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Internal Note</h2>
        <p className="mt-1 text-sm text-slate-600">Add a quick note for the internal team. Notes are visible to all staff on this case.</p>
        <form action={addStudentThreadMessageAction} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="studentId" value={student.id} />
          <input
            name="content"
            required
            placeholder="Write a note..."
            className="min-w-72 flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <SubmitButton
            loadingText="Adding..."
            className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-70"
          >
            Add note
          </SubmitButton>
        </form>
        {recentMessages.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Recent notes</p>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
              {recentMessages.map((message) => (
                <StudentNoteItem
                  key={message.id}
                  message={message}
                  currentUserId={session.user.id}
                  canEditAny={session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN"}
                  studentId={student.id}
                  updateAction={updateStudentNoteAction}
                  deleteAction={deleteStudentNoteAction}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {conversation ? (
          <Link
            href={`/dashboard/communication/${conversation.id}`}
            className="mt-3 inline-block text-sm text-slate-500 hover:text-rose-600"
          >
            Open full thread →
          </Link>
        ) : null}
      </section>

      <div className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
        <div className="mt-4 grid gap-4 text-base text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Name</p>
            <p className="mt-0.5 font-medium text-slate-900">{student.name ?? "N/A"}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Email</p>
            <p className="mt-0.5 font-medium text-slate-900">{student.email}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Assigned Agent</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {latestSubmission?.assignedSubAdmin?.name ??
                latestSubmission?.assignedSubAdmin?.email ??
                "Unassigned"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Last Submission</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {latestSubmission ? latestSubmission.submittedAt.toLocaleString() : "No submission"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Visa Status</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {profile ? formatVisaStatus(profile.visaStatus) : "Not set"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Years Left</p>
            <p className="mt-0.5 font-medium text-slate-900">{formatYearsLeft(profile?.courseEndDate)}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Next Follow-up</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {profile?.nextFollowUpDate ? profile.nextFollowUpDate.toLocaleDateString() : "Not set"}
            </p>
          </div>
        </div>
      </div>

      <form id="profile" action={saveStudentProfileAction} className="scroll-mt-24 space-y-6 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <input type="hidden" name="studentId" value={student.id} />
        <h2 className="text-lg font-semibold text-slate-900">Profile Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name">
            <input
              type="text"
              name="fullName"
              required
              minLength={2}
              maxLength={100}
              defaultValue={student.name ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Email Address">
            <input
              type="email"
              name="email"
              required
              defaultValue={student.email}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Date of Birth">
            <input
              type="date"
              name="dateOfBirth"
              defaultValue={formatDateInput(student.studentProfile?.dateOfBirth)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Phone">
            <input
              type="text"
              name="phone"
              defaultValue={student.studentProfile?.phone ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              name="city"
              defaultValue={student.studentProfile?.city ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Nationality">
            <input
              type="text"
              name="nationality"
              defaultValue={student.studentProfile?.nationality ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Current Education Level">
            <input
              type="text"
              name="currentEducationLevel"
              defaultValue={student.studentProfile?.currentEducationLevel ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Target Course">
            <input
              type="text"
              name="targetCourse"
              defaultValue={student.studentProfile?.targetCourse ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Preferred Intake">
            <input
              type="text"
              name="preferredIntake"
              defaultValue={student.studentProfile?.preferredIntake ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="English Test Score">
            <input
              type="text"
              name="englishTestScore"
              defaultValue={student.studentProfile?.englishTestScore ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Visa Status">
            <select
              name="visaStatus"
              defaultValue={student.studentProfile?.visaStatus ?? "NOT_STARTED"}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              {visaStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatVisaStatus(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course Start Date">
            <input
              type="date"
              name="courseStartDate"
              defaultValue={formatDateInput(student.studentProfile?.courseStartDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Course End Date">
            <input
              type="date"
              name="courseEndDate"
              defaultValue={formatDateInput(student.studentProfile?.courseEndDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Visa Expiry Date">
            <input
              type="date"
              name="visaExpiryDate"
              defaultValue={formatDateInput(student.studentProfile?.visaExpiryDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Last Follow-up Date">
            <input
              type="date"
              name="lastFollowUpDate"
              defaultValue={formatDateInput(student.studentProfile?.lastFollowUpDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Next Follow-up Date">
            <input
              type="date"
              name="nextFollowUpDate"
              defaultValue={formatDateInput(student.studentProfile?.nextFollowUpDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
        </div>
        <Field label="Follow-up Notes">
          <textarea
            name="followUpNotes"
            defaultValue={student.studentProfile?.followUpNotes ?? ""}
            rows={4}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        </Field>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <SubmitButton
            loadingText="Saving..."
            className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-70"
          >
            Save Profile
          </SubmitButton>
        </div>
      </form>
      <div className="mt-3">
        <DeleteWithConfirm
          formAction={deleteStudentAction}
          confirmMessage="Permanently delete this student and all associated data? This cannot be undone."
          buttonLabel="Delete Student"
          buttonClassName="rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <input type="hidden" name="studentId" value={student.id} />
        </DeleteWithConfirm>
      </div>

      <div className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Questionnaire Answers</h2>
        {submissionAnswers.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No questionnaire answers found.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {submissionAnswers.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{key}</p>
                <p className="mt-1 text-base text-slate-900">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Delegation & Assigned Team</h2>
        {session.user.role === "INTERNAL_STAFF" ? (
          <p className="mt-3 text-sm text-slate-600">
            View only. Assignment changes can be made by Admin or Agent.
          </p>
        ) : (
          <form action={assignStudentToInternalStaffAction} className="mt-4 flex flex-wrap items-end gap-4">
            <input type="hidden" name="studentId" value={student.id} />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Assign to case manager</span>
              <select
                name="internalStaffId"
                className="mt-1.5 w-64 rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              >
                <option value="">Select case manager</option>
                {internalStaffUsers.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name ?? staff.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
              <input
                name="notes"
                className="mt-1.5 w-64 rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Assign
            </button>
          </form>
        )}
        {currentAssignments.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No active assignments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {currentAssignments.map((assignment) => (
              <li key={assignment.id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="font-medium text-slate-900">
                  {assignment.assignedTo.name ?? assignment.assignedTo.email}
                  <span className="ml-2 text-sm font-normal text-slate-500">({assignment.assignedTo.role})</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Assigned by {assignment.assignedBy.name ?? assignment.assignedBy.email} on{" "}
                  {assignment.createdAt.toLocaleDateString()}
                </p>
                {assignment.notes ? <p className="mt-2 text-sm text-slate-600">{assignment.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="tasks" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
        <form action={createTaskAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="studentId" value={student.id} />
          <input
            name="title"
            required
            placeholder="Task title"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 lg:col-span-2"
          />
          <select
            name="assigneeId"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          >
            <option value="">Select assignee</option>
            {currentAssignments.map((assignment) => (
              <option key={assignment.id} value={assignment.assignedTo.id}>
                {assignment.assignedTo.name ?? assignment.assignedTo.email}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue="MEDIUM"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create task
          </button>
        </form>
        {tasks.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No tasks yet.</p>
        ) : (
          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <article key={task.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{task.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {task.priority} · {task.status} · {task.assignee.name ?? task.assignee.email}
                    </p>
                  </div>
                  <form action={updateTaskStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="taskId" value={task.id} />
                    <select
                      name="status"
                      defaultValue={task.status}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="DONE">Done</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Update
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        <form action={uploadStudentDocumentAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="studentId" value={student.id} />
          <input
            name="title"
            required
            placeholder="Document title"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <select
            name="category"
            defaultValue="OTHER"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          >
            <option value="PASSPORT">PASSPORT</option>
            <option value="TRANSCRIPT">TRANSCRIPT</option>
            <option value="SOP">SOP</option>
            <option value="OFFER_LETTER">OFFER_LETTER</option>
            <option value="VISA">VISA</option>
            <option value="FINANCIAL">FINANCIAL</option>
            <option value="IDENTITY">IDENTITY</option>
            <option value="OTHER">OTHER</option>
          </select>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,image/*"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload
          </button>
        </form>
        {documents.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No documents uploaded yet.</p>
        ) : (
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {doc.title}
                      <span className="ml-2 text-sm font-normal text-slate-500">({doc.category})</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Uploaded by {doc.uploadedBy.name ?? doc.uploadedBy.email} · {doc.verificationStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={doc.storagePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open
                    </a>
                    <DeleteWithConfirm
                      formAction={deleteStudentDocumentAction}
                      confirmMessage={`Delete "${doc.title}"? This cannot be undone.`}
                      buttonLabel="Delete"
                      buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="documentId" value={doc.id} />
                    </DeleteWithConfirm>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="financials" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Contracts & Invoices</h2>
        <p className="mt-2 text-sm text-slate-600">
          Create billing drafts quickly, then open preview to review before sending.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <form action={createContractPreviewAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
            <input type="hidden" name="studentId" value={student.id} />
            <div>
              <p className="font-semibold text-slate-900">Generate Contract Preview</p>
              <p className="mt-1 text-sm text-slate-600">
                Choose a template and review the final contract content before sending.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Template</span>
              <select
                name="templateId"
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              >
                <option value="">Select contract template</option>
                {templates
                  .filter((template) => template.type === "CONTRACT" || template.type === "GENERAL")
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Generate Preview
            </button>
          </form>

          <form action={createInvoicePreviewAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
            <input type="hidden" name="studentId" value={student.id} />
            <div>
              <p className="font-semibold text-slate-900">Generate Invoice Preview</p>
              <p className="mt-1 text-sm text-slate-600">
                Fill in amount details and open preview to confirm the final email.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Template</span>
              <select
                name="templateId"
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              >
              <option value="">Select invoice template</option>
              {templates
                .filter((template) => template.type === "INVOICE" || template.type === "GENERAL")
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Service / Item Description</span>
              <input
                name="lineItemDescription"
                placeholder="e.g., University application support package"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Quantity</span>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Unit Price (AUD)</span>
                <input
                  name="unitPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={0}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tax Rate (%)</span>
                <input
                  name="taxRate"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={10}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Generate Preview
            </button>
          </form>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Contracts</p>
              <p className="text-sm text-slate-500">{contracts.length} total</p>
            </div>
            {contracts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No contracts yet.</p>
            ) : (
              <ul className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
                {contracts.map((contract) => (
                  <li key={contract.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">{contract.title}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${contractStatusTone(contract.status)}`}
                      >
                        {contract.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">Created {contract.createdAt.toLocaleDateString()}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/dashboard/contracts/${contract.id}/preview`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open Preview
                      </Link>
                      <DeleteWithConfirm
                        formAction={deleteContractAction}
                        confirmMessage={`Delete contract "${contract.title}"? This cannot be undone.`}
                        buttonLabel="Delete"
                        buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <input type="hidden" name="contractId" value={contract.id} />
                        <input type="hidden" name="studentId" value={student.id} />
                      </DeleteWithConfirm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Invoices</p>
              <p className="text-sm text-slate-500">{invoices.length} total</p>
            </div>
            {invoices.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No invoices yet.</p>
            ) : (
              <ul className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">{invoice.invoiceNumber}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${invoiceStatusTone(invoice.status)}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatMoney(invoice.currency, invoice.totalAmount)}{" "}
                      {invoice.dueDate ? `· Due ${invoice.dueDate.toLocaleDateString()}` : ""}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}/preview`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open Preview
                      </Link>
                      <DeleteWithConfirm
                        formAction={deleteInvoiceAction}
                        confirmMessage={`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`}
                        buttonLabel="Delete"
                        buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="studentId" value={student.id} />
                      </DeleteWithConfirm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section id="audit" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
        <p className="mt-1 text-sm text-slate-600">
          History of changes on this student profile. See who did what and when.
        </p>
        {activityLogs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No activity recorded yet.</p>
        ) : (
          <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
            {activityLogs.map((activity) => (
              <li key={activity.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-medium">{activity.actor.name ?? activity.actor.email}</span>
                  <span className="mx-1.5">·</span>
                  <span>{activity.createdAt.toLocaleString()}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function formatDateInput(value?: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function getAnswerEntries(answers?: Prisma.JsonValue) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return [] as [string, string | number | boolean | null][];
  }

  return Object.entries(answers as Record<string, string | number | boolean | null>);
}

async function saveStudentProfileAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "USER" },
    select: { id: true },
  });

  if (!student) {
    redirect("/dashboard");
  }

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect("/dashboard/sub-admin");
    }
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: {
          userId: studentId,
        },
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect("/dashboard/internal-staff");
    }
  }

  const accountParsed = studentAccountSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!accountParsed.success) {
    redirect(`/dashboard/students/${studentId}`);
  }
  const { fullName, email } = accountParsed.data;

  const duplicateEmailUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (duplicateEmailUser && duplicateEmailUser.id !== studentId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.user.update({
    where: { id: studentId },
    data: { name: fullName, email },
  });

  const dateOfBirthRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const dateOfBirth = parseOptionalDate(dateOfBirthRaw);
  const courseStartDate = parseOptionalDate(String(formData.get("courseStartDate") ?? "").trim());
  const courseEndDate = parseOptionalDate(String(formData.get("courseEndDate") ?? "").trim());
  const visaExpiryDate = parseOptionalDate(String(formData.get("visaExpiryDate") ?? "").trim());
  const lastFollowUpDate = parseOptionalDate(String(formData.get("lastFollowUpDate") ?? "").trim());
  const nextFollowUpDate = parseOptionalDate(String(formData.get("nextFollowUpDate") ?? "").trim());
  const visaStatusRaw = String(formData.get("visaStatus") ?? "NOT_STARTED") as VisaStatus;
  const visaStatus = visaStatuses.includes(visaStatusRaw) ? visaStatusRaw : "NOT_STARTED";

  const profile = await prisma.studentProfile.upsert({
    where: { userId: studentId },
    update: {
      dateOfBirth,
      phone: nullableText(formData.get("phone")),
      city: nullableText(formData.get("city")),
      nationality: nullableText(formData.get("nationality")),
      currentEducationLevel: nullableText(formData.get("currentEducationLevel")),
      targetCourse: nullableText(formData.get("targetCourse")),
      preferredIntake: nullableText(formData.get("preferredIntake")),
      englishTestScore: nullableText(formData.get("englishTestScore")),
      visaStatus,
      courseStartDate,
      courseEndDate,
      visaExpiryDate,
      lastFollowUpDate,
      nextFollowUpDate,
      followUpNotes: nullableText(formData.get("followUpNotes")),
    },
    create: {
      userId: studentId,
      dateOfBirth,
      phone: nullableText(formData.get("phone")),
      city: nullableText(formData.get("city")),
      nationality: nullableText(formData.get("nationality")),
      currentEducationLevel: nullableText(formData.get("currentEducationLevel")),
      targetCourse: nullableText(formData.get("targetCourse")),
      preferredIntake: nullableText(formData.get("preferredIntake")),
      englishTestScore: nullableText(formData.get("englishTestScore")),
      visaStatus,
      courseStartDate,
      courseEndDate,
      visaExpiryDate,
      lastFollowUpDate,
      nextFollowUpDate,
      followUpNotes: nullableText(formData.get("followUpNotes")),
    },
    select: { id: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: profile.id,
      entityType: "STUDENT",
      entityId: studentId,
      action: "Updated student profile (details, visa status, follow-up dates)",
      metadata: { visaStatus },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/student");
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteStudentAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/dashboard");
  await prisma.user.deleteMany({
    where: { id: studentId, role: "USER" },
  });
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  redirect(session.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/sub-admin");
}

async function assignStudentToInternalStaffAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const internalStaffId = String(formData.get("internalStaffId") ?? "");
  const notes = nullableText(formData.get("notes"));
  if (!studentId || !internalStaffId) redirect(`/dashboard/students/${studentId}`);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(`/dashboard/students/${studentId}`);

  const staff = await prisma.user.findFirst({
    where: { id: internalStaffId, role: "INTERNAL_STAFF" },
    select: { id: true },
  });
  if (!staff) redirect(`/dashboard/students/${studentId}`);

  await prisma.studentAssignment.updateMany({
    where: { studentProfileId: studentProfile.id, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });

  await prisma.studentAssignment.create({
    data: {
      studentProfileId: studentProfile.id,
      assignedToId: staff.id,
      assignedById: session.user.id,
      notes,
      isActive: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "ASSIGNMENT",
      entityId: studentProfile.id,
      action: "Assigned student to internal staff",
      metadata: { internalStaffId: staff.id, notes },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}`);
}

async function createTaskAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const priority = String(formData.get("priority") ?? "MEDIUM") as TaskPriority;
  if (!studentId || !title || !assigneeId) redirect(`/dashboard/students/${studentId}`);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(`/dashboard/students/${studentId}`);

  const taskPriority: TaskPriority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)
    ? priority
    : "MEDIUM";
  await prisma.task.create({
    data: {
      title,
      studentProfileId: studentProfile.id,
      assigneeId,
      assignerId: session.user.id,
      priority: taskPriority,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "TASK",
      entityId: studentProfile.id,
      action: `Created task: ${title}`,
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  redirect(`/dashboard/students/${studentId}`);
}

async function updateTaskStatusAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "TODO") as TaskStatus;
  const safeStatus: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(status)
    ? status
    : "TODO";

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { studentProfile: true },
  });
  if (!task) redirect("/dashboard");
  if (
    session.user.role !== "ADMIN" &&
    session.user.id !== task.assigneeId &&
    session.user.id !== task.assignerId
  ) {
    redirect("/dashboard");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: safeStatus },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: taskId,
      action: `Updated task status to ${safeStatus}`,
    },
  });

  revalidatePath(`/dashboard/students/${task.studentProfile.userId}`);
  revalidatePath("/dashboard/internal-staff");
  redirect(`/dashboard/students/${task.studentProfile.userId}`);
}

async function uploadStudentDocumentAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "OTHER") as DocumentCategory;
  const file = formData.get("file");
  if (!studentId || !title || !(file instanceof File) || file.size === 0) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (file.size > 20 * 1024 * 1024 || !allowedDocumentMime.has(file.type)) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(`/dashboard/students/${studentId}`);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = path.extname(file.name) || mimeToExt(file.type);
  const sanitizedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "student-docs", studentId);
  await fs.mkdir(uploadDir, { recursive: true });
  const absolutePath = path.join(uploadDir, sanitizedName);
  await fs.writeFile(absolutePath, buffer);
  const publicPath = `/student-docs/${studentId}/${sanitizedName}`;

  const safeCategory: DocumentCategory = [
    "PASSPORT",
    "TRANSCRIPT",
    "SOP",
    "OFFER_LETTER",
    "VISA",
    "FINANCIAL",
    "IDENTITY",
    "OTHER",
  ].includes(category)
    ? category
    : "OTHER";
  await prisma.studentDocument.create({
    data: {
      studentProfileId: studentProfile.id,
      uploadedById: session.user.id,
      category: safeCategory,
      title,
      originalFileName: file.name,
      storagePath: publicPath,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "DOCUMENT",
      entityId: studentProfile.id,
      action: `Uploaded document: ${title}`,
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteStudentDocumentAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const doc = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    select: { id: true, storagePath: true, studentProfileId: true },
  });
  if (!doc) redirect(`/dashboard/students/${studentId}`);

  const localPath = path.join(process.cwd(), "public", doc.storagePath.replace(/^\//, ""));
  await fs.unlink(localPath).catch(() => undefined);
  await prisma.studentDocument.delete({ where: { id: doc.id } });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: doc.studentProfileId,
      entityType: "DOCUMENT",
      entityId: doc.id,
      action: "Deleted student document",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function createContractPreviewAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!studentId || !templateId) redirect(`/dashboard/students/${studentId}`);

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/sub-admin");
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/internal-staff");
  }

  const [student, template] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    }),
    prisma.emailTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!student || !student.studentProfile || !template) redirect(`/dashboard/students/${studentId}`);

  const variables = {
    studentName: student.name ?? student.email,
    email: student.email,
    targetCourse: student.studentProfile.targetCourse ?? "",
    senderName: session.user.name ?? session.user.email ?? "L&B Global",
  };
  const subject = renderTemplate(template.subject, variables);
  const htmlSnapshot = renderTemplate(template.htmlBody, variables);

  const contract = await prisma.contract.create({
    data: {
      studentProfileId: student.studentProfile.id,
      templateId: template.id,
      createdById: session.user.id,
      title: `${template.name} - ${student.name ?? student.email}`,
      subject,
      recipientEmail: student.email,
      htmlSnapshot,
      status: "DRAFT",
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: student.studentProfile.id,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Generated contract preview",
    },
  });
  redirect(`/dashboard/contracts/${contract.id}/preview`);
}

async function createInvoicePreviewAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!studentId || !templateId) redirect(`/dashboard/students/${studentId}`);

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/sub-admin");
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/internal-staff");
  }

  const description = String(formData.get("lineItemDescription") ?? "").trim() || "Consultancy Service";
  const quantity = Number(formData.get("quantity") ?? 1);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);
  const taxRate = Number(formData.get("taxRate") ?? 0);

  const [student, template] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    }),
    prisma.emailTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!student || !student.studentProfile || !template) redirect(`/dashboard/students/${studentId}`);

  const normalizedItems = normalizeInvoiceItems([{ description, quantity, unitPrice }]);
  const totals = calculateInvoiceTotals(normalizedItems, taxRate);
  const invoiceNumber = `INV-${Date.now()}`;
  const dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  const variables = {
    studentName: student.name ?? student.email,
    email: student.email,
    invoiceNumber,
    currency: "AUD",
    totalAmount: totals.totalAmount.toFixed(2),
    dueDate: dueDate.toLocaleDateString(),
    senderName: session.user.name ?? session.user.email ?? "L&B Global",
  };
  const subject = renderTemplate(template.subject, variables);
  const htmlSnapshot = renderTemplate(template.htmlBody, variables);

  const invoice = await prisma.invoice.create({
    data: {
      studentProfileId: student.studentProfile.id,
      templateId: template.id,
      createdById: session.user.id,
      invoiceNumber,
      title: `${template.name} - ${student.name ?? student.email}`,
      subject,
      recipientEmail: student.email,
      currency: "AUD",
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      dueDate,
      status: "DRAFT",
      htmlSnapshot,
      lineItems: {
        create: normalizedItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        })),
      },
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: student.studentProfile.id,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Generated invoice preview",
    },
  });
  redirect(`/dashboard/invoices/${invoice.id}/preview`);
}

async function addStudentThreadMessageAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!studentId || !content) redirect(`/dashboard/students/${studentId}`);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(`/dashboard/students/${studentId}`);

  let conversation = await prisma.conversation.findFirst({
    where: { studentProfileId: studentProfile.id, type: "STUDENT_THREAD" },
    select: { id: true },
  });
  if (!conversation) {
    const created = await prisma.conversation.create({
      data: {
        type: "STUDENT_THREAD",
        title: "Student Internal Thread",
        studentProfileId: studentProfile.id,
        createdById: session.user.id,
      },
      select: { id: true },
    });
    conversation = created;
  }

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: session.user.id,
      },
    },
    update: {},
    create: {
      conversationId: conversation.id,
      userId: session.user.id,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: session.user.id,
      content,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "MESSAGE",
      entityId: conversation.id,
      action: "Added internal message",
    },
  });
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/communication/${conversation.id}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateStudentNoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!studentId || !messageId || !content) redirect(`/dashboard/students/${studentId}`);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: { studentProfile: { select: { userId: true } } },
      },
    },
  });
  if (!message || message.conversation.studentProfile?.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const canEdit = session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN" || message.senderId === session.user.id;
  if (!canEdit) redirect(`/dashboard/students/${studentId}`);

  await prisma.message.update({
    where: { id: messageId },
    data: { content },
  });

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (studentProfile) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: studentProfile.id,
        entityType: "MESSAGE",
        entityId: messageId,
        action: "Edited internal note",
        metadata: { conversationId: message.conversationId },
      },
    });
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/communication/${message.conversationId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteStudentNoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  if (!studentId || !messageId) redirect(`/dashboard/students/${studentId}`);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: { studentProfile: { select: { id: true, userId: true } } },
      },
    },
  });
  if (!message || message.conversation.studentProfile?.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const canDelete = session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN" || message.senderId === session.user.id;
  if (!canDelete) redirect(`/dashboard/students/${studentId}`);

  const studentProfileId = message.conversation.studentProfile?.id;
  await prisma.message.delete({
    where: { id: messageId },
  });

  if (studentProfileId) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: studentProfileId,
        entityType: "MESSAGE",
        entityId: messageId,
        action: "Deleted internal note",
        metadata: { conversationId: message.conversationId },
      },
    });
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/communication/${message.conversationId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteContractAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const contractId = String(formData.get("contractId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!contractId || !studentId) redirect("/dashboard");

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: { studentId, OR: [{ assignedToId: session.user.id }, { assignedToId: null }] },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/sub-admin");
  }
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/internal-staff");
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, studentProfileId: true },
  });
  if (!contract) redirect(`/dashboard/students/${studentId}`);

  await prisma.outboundEmailLog.deleteMany({
    where: { relatedContractId: contract.id },
  });
  await prisma.contract.delete({
    where: { id: contract.id },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Deleted contract",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteInvoiceAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!invoiceId || !studentId) redirect("/dashboard");

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: { studentId, OR: [{ assignedToId: session.user.id }, { assignedToId: null }] },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/sub-admin");
  }
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/internal-staff");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentProfileId: true },
  });
  if (!invoice) redirect(`/dashboard/students/${studentId}`);

  await prisma.outboundEmailLog.deleteMany({
    where: { relatedInvoiceId: invoice.id },
  });
  await prisma.invoice.delete({
    where: { id: invoice.id },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Deleted invoice",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

function nullableText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseOptionalDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mimeToExt(mime: string) {
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".bin";
}

function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function invoiceStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "OVERDUE") return "bg-amber-50 text-amber-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

function contractStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "ACCEPTED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}
