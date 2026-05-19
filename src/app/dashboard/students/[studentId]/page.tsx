import path from "node:path";

import type {
  CaseStage,
  CaseStatus,
  CrmAccountType,
  DocumentVerificationStatus,
  DocumentCategory,
  LeadStatus,
  OpportunityForecastCategory,
  OpportunityStage,
  Prisma,
  QuoteStatus,
  TaskPriority,
  TaskStatus,
  VisaStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ContributionLeaderboard } from "@/components/contribution-leaderboard";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { VisaStatusSavedToast } from "@/components/visa-status-saved-toast";
import { StudentNoteItem } from "@/components/student-note-item";
import { SubmitButton } from "@/components/submit-button";
import { DocumentNotificationReadTracker } from "@/components/document-notification-read-tracker";
import { TaskActionToast } from "@/components/task-action-toast";
import { AuditTab } from "@/app/dashboard/students/[studentId]/tabs/audit-tab";
import { TasksDocumentsTab } from "@/app/dashboard/students/[studentId]/tabs/tasks-documents-tab";
import { auth } from "@/auth";
import { blobOpensThroughAuthenticatedApi } from "@/lib/blob-access";
import { getContributions } from "@/lib/contributions";
import { calculateInvoiceTotals, normalizeInvoiceItems } from "@/lib/invoice-calculator";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, studentDocumentUploadErrorParam, uploadBufferToStorage } from "@/lib/storage";
import { renderTemplate } from "@/lib/template-renderer";
import { MAX_STUDENT_DOCUMENT_UPLOAD_BYTES } from "@/lib/upload-limits";
import { createWorkflowNotification } from "@/lib/workflow-notifications";
import { formatVisaStatus, formatYearsLeft, visaStatuses } from "@/lib/student-tracking";
import {
  allCaseStages,
  caseStageLabel,
  caseStageOrder,
  caseStageTerminals,
  caseStageTone,
  getNextSuggestedStages,
  getStageProgressPercent,
  isTerminalStage,
} from "@/lib/case-stage";

type Params = Promise<{ studentId: string }>;
type SearchParams = Promise<{
  tab?: string;
  taskCreated?: string;
  taskError?: string;
  uploadError?: string;
}>;

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

export default async function StudentProfileManagementPage(props: { params: Params; searchParams: SearchParams }) {
  const { studentId } = await props.params;
  const searchParams = await props.searchParams;
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

  const currentUserId = session.user.id;

  // Placeholders for the disabled `{false && (...)}` sales UI block. The JSX
  // inside still type-checks even though it is never rendered, so we type
  // these arrays to match what Prisma would return — that way the whole
  // dead-code branch stays type-safe without `any` casts.
  type DisabledLead = Prisma.LeadGetPayload<{
    include: {
      account: true;
      owner: { select: { id: true; name: true; email: true; role: true } };
      opportunity: {
        include: {
          quotes: {
            include: {
              submittedBy: { select: { id: true; name: true; email: true } };
              approvedBy: { select: { id: true; name: true; email: true } };
              rejectedBy: { select: { id: true; name: true; email: true } };
            };
          };
          case: true;
        };
      };
    };
  }>;
  const crmAccounts: { id: string; name: string; tag: string | null }[] = [];
  const leadOwners: { id: string; name: string | null; email: string | null; role: string }[] = [];
  const leads: DisabledLead[] = [];

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

  const [student, latestSubmission] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "USER" },
      include: { studentProfile: true },
    }),
    prisma.questionnaireSubmission.findFirst({
      where: { studentId },
      include: { template: true, assignedSubAdmin: true },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  if (!student) {
    redirect("/dashboard");
  }

  const tabRaw = String(searchParams.tab ?? "overview");
  const activeTab:
    | "overview"
    | "profile"
    | "tasks"
    | "financials"
    | "audit"
    | "contributions" =
    tabRaw === "profile" ||
    tabRaw === "tasks" ||
    tabRaw === "financials" ||
    tabRaw === "audit" ||
    tabRaw === "contributions"
      ? tabRaw
      : "overview";
  const studentProfileId = student.studentProfile?.id ?? "__none__";
  const needsOverviewData = activeTab === "overview";
  const needsProfileData = activeTab === "profile";
  const needsTasksData = activeTab === "tasks";
  const needsFinancialData = activeTab === "financials";
  const needsAuditData = activeTab === "audit";
  const needsContributionData = activeTab === "contributions";

  // Fire allDocuments before the main Promise.all so both run in parallel.
  // We keep it separate because TypeScript can't infer the Prisma include type
  // through a conditional ternary inside Promise.all.
  type StudentDocumentWithRelations = Prisma.StudentDocumentGetPayload<{
    include: {
      uploadedBy: { select: { id: true; name: true; email: true } };
      returnedBy: { select: { id: true; name: true; email: true } };
    };
  }>;
  const allDocumentsPromise = needsTasksData
    ? prisma.studentDocument.findMany({
        where: { studentProfileId },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          returnedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : Promise.resolve([] as StudentDocumentWithRelations[]);

  // Fetch all tab-specific data in parallel — independent queries run concurrently
  const [
    contributionData,
    internalStaffUsers,
    delegationTeamUsers,
    currentAssignments,
    internalStaffAssignedForTasks,
    tasks,
    allDocuments,
    templates,
    contracts,
    invoices,
    conversation,
    recentMessages,
    activityLogs,
  ] = await Promise.all([
    needsContributionData && student.studentProfile
      ? getContributions({ studentProfileId })
      : Promise.resolve(null),
    (needsProfileData || needsFinancialData)
      ? prisma.user.findMany({
          where: { role: "INTERNAL_STAFF" },
          select: { id: true, name: true, email: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    needsProfileData
      ? prisma.user.findMany({
          where: { role: { in: ["INTERNAL_STAFF", "SUB_ADMIN"] } },
          select: { id: true, name: true, email: true, role: true },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    needsProfileData
      ? prisma.studentAssignment.findMany({
          where: { studentProfileId, isActive: true },
          include: {
            assignedTo: { select: { id: true, name: true, email: true, role: true } },
            assignedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    needsTasksData && session.user.role === "INTERNAL_STAFF" && studentProfileId !== "__none__"
      ? prisma.studentAssignment.findFirst({
          where: { studentProfileId, isActive: true, assignedToId: session.user.id },
          select: { id: true },
        })
      : Promise.resolve(null),
    needsTasksData
      ? prisma.task.findMany({
          where: { studentProfileId },
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 30,
        })
      : Promise.resolve([]),
    allDocumentsPromise,
    needsFinancialData
      ? prisma.emailTemplate.findMany({
          where: { isActive: true },
          orderBy: [{ type: "asc" }, { createdAt: "desc" }],
          take: 50,
        })
      : Promise.resolve([]),
    needsFinancialData
      ? prisma.contract.findMany({
          where: { studentProfileId },
          include: { createdBy: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    needsFinancialData
      ? prisma.invoice.findMany({
          where: { studentProfileId },
          include: {
            lineItems: true,
            createdBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    needsOverviewData
      ? prisma.conversation.findFirst({
          where: { studentProfileId, type: "STUDENT_THREAD" },
          select: { id: true, title: true },
        })
      : Promise.resolve(null),
    needsOverviewData
      ? prisma.message.findMany({
          where: { conversation: { studentProfileId, type: "STUDENT_THREAD" } },
          include: { sender: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        })
      : Promise.resolve([]),
    needsAuditData
      ? prisma.activityLog.findMany({
          where: { targetStudentProfileId: studentProfileId },
          include: { actor: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  const canCreateTasks =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    Boolean(internalStaffAssignedForTasks);

  const documentsById = new Map(allDocuments.map((doc) => [doc.id, doc]));
  const supersededDocumentIds = new Set(
    allDocuments
      .map((doc) => doc.replacedDocumentId)
      .filter((id): id is string => Boolean(id)),
  );

  const documents = allDocuments
    .filter((doc) => !supersededDocumentIds.has(doc.id))
    .slice(0, 30)
    .map((doc) => {
      const previousVersions: typeof allDocuments = [];
      let cursor = doc.replacedDocumentId ? documentsById.get(doc.replacedDocumentId) : undefined;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        previousVersions.push(cursor);
        cursor = cursor.replacedDocumentId ? documentsById.get(cursor.replacedDocumentId) : undefined;
      }
      return {
        ...doc,
        previousVersions: previousVersions.map((prev) => ({
          id: prev.id,
          title: prev.title,
          storagePath: prev.storagePath,
          verificationStatus: prev.verificationStatus,
          returnedAt: prev.returnedAt,
          returnedNote: prev.returnedNote,
          returnedBy: prev.returnedBy
            ? { name: prev.returnedBy.name, email: prev.returnedBy.email }
            : null,
          uploadedBy: { name: prev.uploadedBy.name, email: prev.uploadedBy.email },
          createdAt: prev.createdAt,
        })),
      };
    });

  const submissionAnswers = needsProfileData ? getAnswerEntries(latestSubmission?.answers) : [];
  const backLink =
    session.user.role === "ADMIN"
      ? "/dashboard/admin"
      : session.user.role === "SUB_ADMIN"
        ? "/dashboard/sub-admin"
        : "/dashboard/internal-staff";
  const profile = student.studentProfile;

  const isAssignedCaseManager = session.user.role === "INTERNAL_STAFF";
  const canManageStudentDelegation =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    isAssignedCaseManager;
  const caseManagersForDelegation = delegationTeamUsers.filter((u) => u.role === "INTERNAL_STAFF");
  const agentsForDelegation = delegationTeamUsers.filter((u) => u.role === "SUB_ADMIN");
  const tabBase = `/dashboard/students/${studentId}`;

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

      <nav className="sticky top-0 z-10 -mx-6 -mt-2 mb-6 flex flex-wrap gap-2 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
        {[
          { id: "overview", label: "Overview & Notes" },
          { id: "profile", label: "Profile & Assignment" },
          { id: "tasks", label: "Tasks & Documents" },
          { id: "financials", label: "Contracts & Invoices" },
          { id: "audit", label: "Audit Log" },
          { id: "contributions", label: "Contributions" },
        ].map((tab) => (
          <Link
            key={tab.id}
            href={`${tabBase}?tab=${tab.id}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Suspense fallback={null}>
        <VisaStatusSavedToast />
      </Suspense>

      {activeTab === "overview" && (
      <>
      <section id="overview" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Internal Note</h2>
        <p className="mt-1 text-sm text-slate-600">Add a quick note for the internal team. Notes are visible to all staff on this case.</p>
        <form action={addStudentThreadMessageAction} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="studentId" value={studentId} />
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
                  studentId={studentId}
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

      <CaseStageCard
        studentId={studentId}
        currentStage={profile?.caseStage ?? "CONSULTATION_AND_DOCUMENTATION"}
        updatedAt={profile?.caseStageUpdatedAt ?? null}
        action={updateCaseStageAction}
      />
      </>
      )}

      {activeTab === "profile" && (
      <>
      <form id="profile" action={saveStudentProfileAction} className="scroll-mt-24 space-y-6 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <input type="hidden" name="studentId" value={studentId} />
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
          <Field label="Current Address" className="sm:col-span-2">
            <textarea
              name="currentAddress"
              defaultValue={student.studentProfile?.currentAddress ?? ""}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <div className="sm:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Emergency Contact Details
            </h3>
          </div>
          <Field label="Emergency Contact Full Name">
            <input
              type="text"
              name="emergencyContactName"
              defaultValue={student.studentProfile?.emergencyContactName ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Emergency Contact Email Address">
            <input
              type="email"
              name="emergencyContactEmail"
              defaultValue={student.studentProfile?.emergencyContactEmail ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Emergency Contact Phone Number">
            <input
              type="text"
              name="emergencyContactPhone"
              defaultValue={student.studentProfile?.emergencyContactPhone ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Emergency Contact Residential Address" className="sm:col-span-2">
            <textarea
              name="emergencyContactAddress"
              defaultValue={student.studentProfile?.emergencyContactAddress ?? ""}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
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
          <input type="hidden" name="studentId" value={studentId} />
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
        {!canManageStudentDelegation ? (
          <p className="mt-3 text-sm text-slate-600">
            You can view assignments here. Only an admin, agent, or the assigned case manager can change who
            owns this case.
          </p>
        ) : (
          <form action={assignStudentDelegationAction} className="mt-4 flex flex-wrap items-end gap-4">
            <input type="hidden" name="studentId" value={studentId} />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Assign to case manager or agent</span>
              <select
                name="assigneeId"
                required
                className="mt-1.5 min-w-64 rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                defaultValue=""
              >
                <option value="" disabled>
                  Select case manager or agent
                </option>
                {caseManagersForDelegation.length > 0 ? (
                  <optgroup label="Case managers">
                    {caseManagersForDelegation.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name ?? member.email}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {agentsForDelegation.length > 0 ? (
                  <optgroup label="Agents">
                    {agentsForDelegation.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name ?? member.email}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
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
      </>
      )}

      {false && (
      <section id="sales" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Lead Management Workflow</h2>
        <p className="mt-1 text-sm text-slate-600">
          Progression: New → Contacted → Qualified/Nurture/Disqualified → Converted
        </p>

        <form action={createLeadAction} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <input type="hidden" name="studentId" value={studentId} />
          <p className="font-medium text-slate-900">Create Lead (Salesforce-style intake)</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              name="leadName"
              required
              placeholder="Lead Name"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="phone"
              placeholder="Phone"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="source"
              placeholder="Source"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="sourceChannel"
              placeholder="Source Channel (e.g. Facebook)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="campaignName"
              placeholder="Campaign (optional)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <select
              name="accountSelection"
              defaultValue="CREATE_NEW"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="CREATE_NEW">Create New Account</option>
              <option value="USE_EXISTING">Use Existing Account</option>
            </select>
            <select
              name="existingAccountId"
              defaultValue=""
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="">Existing Account (if selected)</option>
              {crmAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.tag ? ` (${account.tag})` : ""}
                </option>
              ))}
            </select>
            <select
              name="newAccountType"
              defaultValue="STUDENT"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="STUDENT">Student</option>
              <option value="PARENT">Parent/Sponsor</option>
              <option value="PARTNER">Partner</option>
              <option value="INSTITUTION">Institution</option>
            </select>
            <input
              name="newAccountName"
              placeholder="New Account Name (if creating)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2 lg:col-span-2"
            />
            <select
              name="ownerId"
              defaultValue={currentUserId}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="">Unassigned owner</option>
              {leadOwners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {(owner.name ?? owner.email) + ` (${owner.role})`}
                </option>
              ))}
            </select>
            <input
              name="nextFollowUpAt"
              type="date"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="leadScore"
              type="number"
              min={0}
              max={100}
              defaultValue={40}
              placeholder="Lead Score (0-100)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="parentName"
              placeholder="Parent/Sponsor Name"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="parentPhone"
              placeholder="Parent/Sponsor Phone"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="parentEmail"
              placeholder="Parent/Sponsor Email"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Create Lead
            </button>
          </div>
        </form>

        {leads.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No leads yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {leads.map((lead) => {
              const opportunity = lead.opportunity;
              const approvedQuoteExists =
                opportunity?.quotes.some((quote) => quote.status === "APPROVED") ?? false;
              const caseActivities = opportunity?.case
                ? activityLogs.filter(
                    (activity) =>
                      activity.entityType === "CASE" && activity.entityId === opportunity.case?.id,
                  )
                : [];

              return (
                <article key={lead.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{lead.name}</p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {lead.email ?? "No email"} · {lead.phone ?? "No phone"} · {lead.source ?? "No source"}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        Account: {lead.account.name} ({formatCrmAccountType(lead.account.accountType)})
                        {lead.account.tag ? ` (${lead.account.tag})` : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        Owner: {lead.owner?.name ?? lead.owner?.email ?? "Unassigned"} · Score:{" "}
                        {lead.leadScore}/100
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        Next Follow-up: {lead.nextFollowUpAt ? lead.nextFollowUpAt.toLocaleDateString() : "Not set"}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${leadStatusTone(lead.status)}`}>
                      {formatLeadStatus(lead.status)}
                    </span>
                  </div>

                  <form action={updateLeadQualificationAction} className="mt-3 grid gap-2 sm:grid-cols-4">
                    <input type="hidden" name="studentId" value={studentId} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select
                      name="ownerId"
                      defaultValue={lead.ownerId ?? ""}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    >
                      <option value="">Unassigned owner</option>
                      {leadOwners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {(owner.name ?? owner.email) + ` (${owner.role})`}
                        </option>
                      ))}
                    </select>
                    <input
                      name="leadScore"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={lead.leadScore}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <input
                      name="nextFollowUpAt"
                      type="date"
                      defaultValue={formatDateInput(lead.nextFollowUpAt)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <input
                      name="qualificationReason"
                      defaultValue={lead.qualificationReason ?? ""}
                      placeholder="Qualification reason"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <input
                      name="qualificationNotes"
                      defaultValue={lead.qualificationNotes ?? ""}
                      placeholder="Qualification notes"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-3"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-fit"
                    >
                      Save Lead Details
                    </button>
                  </form>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="CONTACTED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Mark Contacted
                      </button>
                    </form>
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="QUALIFIED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Qualify
                      </button>
                    </form>
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="NURTURE" />
                      <button
                        type="submit"
                        className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                      >
                        Move to Nurture
                      </button>
                    </form>
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="DISQUALIFIED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Disqualify
                      </button>
                    </form>
                    {lead.status === "QUALIFIED" && !opportunity ? (
                      <form action={convertLeadAction}>
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="leadId" value={lead.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Convert to Opportunity
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {opportunity ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">Opportunity</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${opportunityStageTone(opportunity.stage)}`}>
                          {formatOpportunityStage(opportunity.stage)}
                        </span>
                      </div>

                      <form action={updateOpportunityPipelineAction} className="mt-3 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <input
                          name="name"
                          defaultValue={opportunity.name}
                          placeholder="Opportunity name"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2"
                        />
                        <input
                          name="amount"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={opportunity.amount}
                          placeholder="Amount"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <input
                          name="probability"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={opportunity.probability}
                          placeholder="Probability %"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <input
                          name="expectedCloseDate"
                          type="date"
                          defaultValue={formatDateInput(opportunity.expectedCloseDate)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <select
                          name="forecastCategory"
                          defaultValue={opportunity.forecastCategory}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        >
                          <option value="PIPELINE">Pipeline</option>
                          <option value="BEST_CASE">Best Case</option>
                          <option value="COMMIT">Commit</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                        <select
                          name="stage"
                          defaultValue={opportunity.stage}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        >
                          <option value="NEW">New</option>
                          <option value="QUOTE_SENT">Quote Sent</option>
                          <option value="CLOSED_WON">Closed Won</option>
                          <option value="CLOSED_LOST">Closed Lost</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-fit"
                        >
                          Save Pipeline
                        </button>
                      </form>
                      <p className="mt-2 text-xs text-slate-500">
                        Weighted pipeline value:{" "}
                        {formatMoney("AUD", (opportunity.amount * opportunity.probability) / 100)}
                      </p>

                      <form action={createQuoteAction} className="mt-4 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <input
                          name="amount"
                          type="number"
                          min={0}
                          step="0.01"
                          required
                          placeholder="Amount"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <input
                          name="description"
                          placeholder="Description"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:col-span-3 sm:w-fit"
                        >
                          Create Quote
                        </button>
                      </form>

                      {opportunity.quotes.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No quotes yet.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {opportunity.quotes.map((quote) => (
                            <li key={quote.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {formatMoney("AUD", quote.amount)} {quote.description ? `· ${quote.description}` : ""}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {quote.createdAt.toLocaleString()}
                                  </p>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${quoteStatusTone(quote.status)}`}>
                                  {formatQuoteStatus(quote.status)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {quote.status === "DRAFT" ? (
                                  <form action={submitQuoteForApprovalAction}>
                                    <input type="hidden" name="studentId" value={studentId} />
                                    <input type="hidden" name="quoteId" value={quote.id} />
                                    <button
                                      type="submit"
                                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Submit for Approval
                                    </button>
                                  </form>
                                ) : null}
                                {quote.status === "SUBMITTED" ? (
                                  <>
                                    <form action={approveQuoteAction} className="flex items-center gap-2">
                                      <input type="hidden" name="studentId" value={studentId} />
                                      <input type="hidden" name="quoteId" value={quote.id} />
                                      <input
                                        name="approvalNotes"
                                        placeholder="Approval notes"
                                        className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-slate-900 focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                      >
                                        Approve
                                      </button>
                                    </form>
                                    <form action={rejectQuoteAction} className="flex items-center gap-2">
                                      <input type="hidden" name="studentId" value={studentId} />
                                      <input type="hidden" name="quoteId" value={quote.id} />
                                      <input
                                        name="approvalNotes"
                                        placeholder="Rejection reason"
                                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-slate-900 focus:border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-300"
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                      >
                                        Reject
                                      </button>
                                    </form>
                                  </>
                                ) : null}
                              </div>
                              {(quote.submittedBy || quote.approvedBy || quote.rejectedBy || quote.approvalNotes) ? (
                                <p className="mt-2 text-xs text-slate-500">
                                  {quote.submittedBy
                                    ? `Submitted by ${quote.submittedBy.name ?? quote.submittedBy.email}. `
                                    : ""}
                                  {quote.approvedBy
                                    ? `Approved by ${quote.approvedBy.name ?? quote.approvedBy.email}. `
                                    : ""}
                                  {quote.rejectedBy
                                    ? `Rejected by ${quote.rejectedBy.name ?? quote.rejectedBy.email}. `
                                    : ""}
                                  {quote.approvalNotes ? `Notes: ${quote.approvalNotes}` : ""}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}

                      {approvedQuoteExists && opportunity.stage !== "CLOSED_WON" ? (
                        <form action={closeOpportunityAction} className="mt-3">
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="opportunityId" value={opportunity.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Close Opportunity
                          </button>
                        </form>
                      ) : null}

                      {opportunity.stage === "CLOSED_WON" && !opportunity.case ? (
                        <form action={convertOpportunityToCaseAction} className="mt-3">
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="opportunityId" value={opportunity.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Convert to Case
                          </button>
                        </form>
                      ) : null}

                      {opportunity.case ? (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">Case</p>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${caseStatusTone(opportunity.case.status)}`}>
                              {formatCaseStatus(opportunity.case.status)}
                            </span>
                          </div>
                          <form action={updateCaseAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                            <input type="hidden" name="studentId" value={studentId} />
                            <input type="hidden" name="caseId" value={opportunity.case.id} />
                            <input
                              name="title"
                              defaultValue={opportunity.case.title}
                              required
                              placeholder="Case title"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            />
                            <select
                              name="status"
                              defaultValue={opportunity.case.status}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            >
                              <option value="OPEN">Open</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="RESOLVED">Resolved</option>
                              <option value="CLOSED">Closed</option>
                            </select>
                            <textarea
                              name="description"
                              defaultValue={opportunity.case.description ?? ""}
                              placeholder="Case description"
                              rows={3}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2"
                            />
                            <select
                              name="assignedAgentId"
                              defaultValue={opportunity.case.assignedAgentId ?? ""}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            >
                              <option value="">Unassigned agent</option>
                              {internalStaffUsers.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {staff.name ?? staff.email}
                                </option>
                              ))}
                            </select>
                            <input
                              name="activityNote"
                              placeholder="Activity note (optional)"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-fit"
                            >
                              Save Case Update
                            </button>
                          </form>
                          <div className="mt-3">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Case Activity Log</p>
                            {caseActivities.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-600">No case activity yet.</p>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {caseActivities.slice(0, 8).map((activity) => (
                                  <li key={activity.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {activity.actor.name ?? activity.actor.email} · {activity.createdAt.toLocaleString()}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}

      {activeTab === "tasks" && (
        <>
          <Suspense fallback={null}>
            <TaskActionToast />
          </Suspense>
          <DocumentNotificationReadTracker studentId={studentId} />
          <TasksDocumentsTab
            studentId={studentId}
            tasks={tasks}
            documents={documents}
            createTaskAction={createTaskAction}
            updateTaskStatusAction={updateTaskStatusAction}
            updateTaskChecklistAction={updateTaskChecklistAction}
            uploadStudentDocumentAction={uploadStudentDocumentAction}
            updateStudentDocumentVerificationAction={updateStudentDocumentVerificationAction}
            disputeStudentDocumentReturnAction={disputeStudentDocumentReturnAction}
            uploadReplacementDocumentAction={uploadReplacementDocumentAction}
            deleteStudentDocumentAction={deleteStudentDocumentAction}
            viewerRole={session.user.role as "ADMIN" | "SUB_ADMIN" | "INTERNAL_STAFF"}
            canCreateTasks={canCreateTasks}
            blobOpensThroughAuthenticatedApi={blobOpensThroughAuthenticatedApi()}
          />
        </>
      )}

      {activeTab === "financials" && (
      <section id="financials" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Contracts & Invoices</h2>
        <p className="mt-2 text-sm text-slate-600">
          Create billing drafts quickly, then open preview to review before sending.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <form action={createContractPreviewAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
            <input type="hidden" name="studentId" value={studentId} />
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
            <input type="hidden" name="studentId" value={studentId} />
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
                        <input type="hidden" name="studentId" value={studentId} />
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
                        <input type="hidden" name="studentId" value={studentId} />
                      </DeleteWithConfirm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      )}

      {activeTab === "audit" && <AuditTab activityLogs={activityLogs} />}

      {activeTab === "contributions" && (
        contributionData ? (
          <ContributionLeaderboard
            data={contributionData}
            title="Who contributed to this case"
            subtitle="Stages 70% · Documents 15% · Tasks 15% — scoped to this student only."
          />
        ) : (
          <section className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Contributions</h2>
            <p className="mt-2 text-sm text-slate-600">
              This student does not have a profile yet, so per-case contribution data is unavailable.
            </p>
          </section>
        )
      )}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function CaseStageCard({
  studentId,
  currentStage,
  updatedAt,
  action,
}: {
  studentId: string;
  currentStage: CaseStage;
  updatedAt: Date | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const suggestions = getNextSuggestedStages(currentStage);
  const defaultNext = suggestions[0] ?? currentStage;
  const terminal = isTerminalStage(currentStage);
  const progressPct = getStageProgressPercent(currentStage);
  const linearIdx = caseStageOrder.indexOf(currentStage);

  return (
    <section
      id="case-stage"
      className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Case Stage</h2>
          <p className="mt-1 text-sm text-slate-600">
            Track this student&apos;s position in the application workflow.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${caseStageTone(currentStage)}`}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
          {caseStageLabel(currentStage)}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Linear progress</span>
          <span>
            {terminal
              ? "Outcome"
              : `Step ${linearIdx + 1} of ${caseStageOrder.length}`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              terminal && currentStage !== "VISA_GRANTED"
                ? "bg-rose-500"
                : "bg-gradient-to-r from-rose-500 to-blue-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {caseStageOrder.map((stage, idx) => {
            const isCurrent = stage === currentStage;
            const isPast = !terminal && linearIdx > idx;
            return (
              <span
                key={stage}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  isCurrent
                    ? caseStageTone(stage)
                    : isPast
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {caseStageLabel(stage)}
              </span>
            );
          })}
        </div>
      </div>

      {updatedAt ? (
        <p className="mt-3 text-xs text-slate-500">
          Stage last updated: {updatedAt.toLocaleString()}
        </p>
      ) : null}

      <form
        action={action}
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <select
          name="caseStage"
          defaultValue={defaultNext}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
        >
          <optgroup label="Workflow stages">
            {caseStageOrder.map((stage) => (
              <option key={stage} value={stage}>
                {caseStageLabel(stage)}
                {suggestions.includes(stage) ? " (suggested)" : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="Outcomes / end states">
            {caseStageTerminals.map((stage) => (
              <option key={stage} value={stage}>
                {caseStageLabel(stage)}
                {suggestions.includes(stage) ? " (suggested)" : ""}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Move to stage
        </button>
        <p className="self-center text-xs text-slate-500 sm:max-w-xs">
          Any-to-any transitions are allowed; the suggested option follows the
          standard workflow.
        </p>
      </form>

    </section>
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

function studentProfileUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=profile`;
}

function studentTasksUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=tasks`;
}

function studentFinancialsUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=financials`;
}

function studentOverviewCaseStageUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=overview#case-stage`;
}

function studentOverviewUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=overview`;
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
      redirect(studentProfileUrl(studentId));
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
      redirect(studentProfileUrl(studentId));
    }
  }

  const accountParsed = studentAccountSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!accountParsed.success) {
    redirect(studentProfileUrl(studentId));
  }
  const { fullName, email } = accountParsed.data;

  const duplicateEmailUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (duplicateEmailUser && duplicateEmailUser.id !== studentId) {
    redirect(studentProfileUrl(studentId));
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
      currentAddress: nullableText(formData.get("currentAddress")),
      emergencyContactName: nullableText(formData.get("emergencyContactName")),
      emergencyContactEmail: nullableText(formData.get("emergencyContactEmail")),
      emergencyContactPhone: nullableText(formData.get("emergencyContactPhone")),
      emergencyContactAddress: nullableText(formData.get("emergencyContactAddress")),
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
      currentAddress: nullableText(formData.get("currentAddress")),
      emergencyContactName: nullableText(formData.get("emergencyContactName")),
      emergencyContactEmail: nullableText(formData.get("emergencyContactEmail")),
      emergencyContactPhone: nullableText(formData.get("emergencyContactPhone")),
      emergencyContactAddress: nullableText(formData.get("emergencyContactAddress")),
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
  redirect(`/dashboard/students/${studentId}?tab=profile&profileSaved=1`);
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

async function assignStudentDelegationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const returnToProfileTab = studentId ? studentProfileUrl(studentId) : "/dashboard";

  const assigneeIdRaw =
    String(formData.get("assigneeId") ?? "").trim() ||
    String(formData.get("internalStaffId") ?? "").trim();
  const notes = nullableText(formData.get("notes"));
  if (!studentId || !assigneeIdRaw) redirect(returnToProfileTab);

  const mayDelegate =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    session.user.role === "INTERNAL_STAFF";
  if (!mayDelegate) redirect("/dashboard");

  if (session.user.role === "INTERNAL_STAFF") {
    const allowed = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!allowed) redirect(returnToProfileTab);
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(returnToProfileTab);

  const assignee = await prisma.user.findFirst({
    where: { id: assigneeIdRaw, role: { in: ["INTERNAL_STAFF", "SUB_ADMIN"] } },
    select: { id: true, role: true },
  });
  if (!assignee) redirect(returnToProfileTab);

  await prisma.studentAssignment.updateMany({
    where: { studentProfileId: studentProfile.id, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });

  await prisma.studentAssignment.create({
    data: {
      studentProfileId: studentProfile.id,
      assignedToId: assignee.id,
      assignedById: session.user.id,
      notes,
      isActive: true,
    },
  });

  if (assignee.role === "SUB_ADMIN") {
    await prisma.questionnaireSubmission.updateMany({
      where: { studentId },
      data: { assignedToId: assignee.id },
    });
  }

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "ASSIGNMENT",
      entityId: studentProfile.id,
      action:
        assignee.role === "SUB_ADMIN"
          ? "Assigned student to agent"
          : "Assigned student to case manager",
      metadata: { assigneeId: assignee.id, assigneeRole: assignee.role, notes },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(returnToProfileTab);
}

async function createTaskAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = nullableText(formData.get("description"));
  const priority = String(formData.get("priority") ?? "MEDIUM") as TaskPriority;

  if (!studentId) redirect("/dashboard");

  if (!title) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=missing-title`);
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      id: true,
      assignments: {
        where: { isActive: true },
        select: { assignedToId: true },
      },
    },
  });
  if (!studentProfile) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=no-profile`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) {
      redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=not-assigned`);
    }
  }

  if (session.user.role === "SUB_ADMIN") {
    const allowed = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!allowed) {
      redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=sub-admin-access`);
    }
  }

  const taskPriority: TaskPriority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)
    ? priority
    : "MEDIUM";
  await prisma.task.create({
    data: {
      title,
      description,
      studentProfileId: studentProfile.id,
      assigneeId: session.user.id,
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
  redirect(`/dashboard/students/${studentId}?tab=tasks&taskCreated=1`);
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
    redirect(studentTasksUrl(task.studentProfile.userId));
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
  redirect(`/dashboard/students/${task.studentProfile.userId}?tab=tasks`);
}

async function updateTaskChecklistAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value))
    .filter(Boolean);
  const status = String(formData.get("status") ?? "DONE") as TaskStatus;
  const safeStatus: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(status)
    ? status
    : "DONE";

  if (!studentId || taskIds.length === 0) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  const selectedTasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      studentProfile: { select: { id: true, userId: true } },
    },
  });

  const allowedTasks = selectedTasks.filter((task) => {
    if (task.studentProfile.userId !== studentId) return false;
    return (
      session.user.role === "ADMIN" ||
      session.user.id === task.assigneeId ||
      session.user.id === task.assignerId
    );
  });

  if (allowedTasks.length === 0) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  const allowedTaskIds = allowedTasks.map((task) => task.id);
  const targetStudentProfileId = allowedTasks[0].studentProfileId;

  await prisma.task.updateMany({
    where: { id: { in: allowedTaskIds } },
    data: { status: safeStatus },
  });

  await prisma.activityLog.createMany({
    data: allowedTaskIds.map((taskId) => ({
      actorId: session.user.id,
      targetStudentProfileId,
      entityType: "TASK",
      entityId: taskId,
      action: `Updated task status from checklist to ${safeStatus}`,
    })),
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function updateCaseStageAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const stageRaw = String(formData.get("caseStage") ?? "") as CaseStage;
  if (!studentId) redirect("/dashboard");
  if (!allCaseStages.includes(stageRaw)) {
    redirect(studentOverviewCaseStageUrl(studentId));
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      id: true,
      caseStage: true,
      assignments: {
        where: { isActive: true },
        select: { assignedToId: true },
      },
    },
  });
  if (!profile) redirect(studentOverviewCaseStageUrl(studentId));

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = profile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentOverviewCaseStageUrl(studentId));
  }

  if (session.user.role === "SUB_ADMIN") {
    const allowed = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!allowed) redirect(studentOverviewCaseStageUrl(studentId));
  }

  const previous = profile.caseStage;
  if (previous === stageRaw) {
    redirect(studentOverviewCaseStageUrl(studentId));
  }

  await prisma.studentProfile.update({
    where: { id: profile.id },
    data: {
      caseStage: stageRaw,
      caseStageUpdatedAt: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: profile.id,
      entityType: "CASE_STAGE",
      entityId: profile.id,
      action: `Moved case stage: ${caseStageLabel(previous)} → ${caseStageLabel(stageRaw)}`,
      metadata: { from: previous, to: stageRaw },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/student");
  redirect(studentOverviewCaseStageUrl(studentId));
}

async function uploadStudentDocumentAction(formData: FormData) {
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
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "OTHER") as DocumentCategory;
  const file = formData.get("file");
  if (!studentId || !title || !(file instanceof File) || file.size === 0) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }
  if (file.size > MAX_STUDENT_DOCUMENT_UPLOAD_BYTES) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&uploadError=file-too-large`);
  }
  if (!allowedDocumentMime.has(file.type)) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&uploadError=invalid-type`);
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(`/dashboard/students/${studentId}?tab=tasks`);

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfileId: studentProfile.id,
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect(studentTasksUrl(studentId));
    }
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = path.extname(file.name) || mimeToExt(file.type);
  const sanitizedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const relativePath = `student-docs/${studentId}/${sanitizedName}`;
  let publicPath: string;
  try {
    publicPath = await uploadBufferToStorage({
      buffer,
      mimeType: file.type,
      blobPath: relativePath,
      localRelativePath: relativePath,
    });
  } catch (error) {
    console.error("uploadStudentDocumentAction", error);
    redirect(
      `/dashboard/students/${studentId}?tab=tasks&uploadError=${studentDocumentUploadErrorParam(error)}`,
    );
  }

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
  try {
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
  } catch (error) {
    console.error("uploadStudentDocumentAction db", error);
    await deleteStoredFile(publicPath).catch(() => undefined);
    redirect(`/dashboard/students/${studentId}?tab=tasks&uploadError=save-failed`);
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function uploadReplacementDocumentAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const replacementTitle = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");
  if (!studentId || !documentId || !(file instanceof File) || file.size === 0) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }
  if (file.size > MAX_STUDENT_DOCUMENT_UPLOAD_BYTES) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&uploadError=file-too-large`);
  }
  if (!allowedDocumentMime.has(file.type)) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&uploadError=invalid-type`);
  }

  const document = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: { where: { isActive: true }, select: { assignedToId: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!document || document.studentProfile.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }
  if (!document.returnedAt || !document.returnedById || document.returnResolvedAt) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = document.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentTasksUrl(studentId));
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = path.extname(file.name) || mimeToExt(file.type);
  const sanitizedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const relativePath = `student-docs/${studentId}/${sanitizedName}`;
  let publicPath: string;
  try {
    publicPath = await uploadBufferToStorage({
      buffer,
      mimeType: file.type,
      blobPath: relativePath,
      localRelativePath: relativePath,
    });
  } catch (error) {
    console.error("uploadReplacementDocumentAction", error);
    redirect(
      `/dashboard/students/${studentId}?tab=tasks&uploadError=${studentDocumentUploadErrorParam(error)}`,
    );
  }

  const title = replacementTitle || `${document.title} (Revised)`;
  try {
    const replacement = await prisma.studentDocument.create({
      data: {
        studentProfileId: document.studentProfileId,
        uploadedById: session.user.id,
        replacedDocumentId: document.id,
        category: document.category,
        title,
        originalFileName: file.name,
        storagePath: publicPath,
        mimeType: file.type,
        sizeBytes: file.size,
        verificationStatus: "PENDING",
        notes: document.returnedNote
          ? `Replacement uploaded for returned document. Return reason: ${document.returnedNote}`
          : "Replacement uploaded for returned document.",
      },
    });

    await prisma.studentDocument.update({
      where: { id: document.id },
      data: { returnResolvedAt: new Date() },
    });

    await createWorkflowNotification({
      recipientId: document.returnedById,
      actorId: session.user.id,
      studentProfileId: document.studentProfileId,
      documentId: replacement.id,
      type: "DOCUMENT_REPLACEMENT_UPLOADED",
      title: "Replacement document uploaded",
      message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${title}`,
      note: document.returnedNote,
      link: `/dashboard/students/${studentId}?tab=tasks`,
      actionRequired: true,
      metadata: { originalDocumentId: document.id, replacementDocumentId: replacement.id },
    });

    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: document.studentProfileId,
        targetUserId: document.returnedById,
        entityType: "DOCUMENT",
        entityId: replacement.id,
        action: "Uploaded replacement document for returned file",
        metadata: { originalDocumentId: document.id, replacementDocumentId: replacement.id },
      },
    });
  } catch (error) {
    console.error("uploadReplacementDocumentAction db", error);
    await deleteStoredFile(publicPath).catch(() => undefined);
    redirect(`/dashboard/students/${studentId}?tab=tasks&uploadError=save-failed`);
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function updateStudentDocumentVerificationAction(formData: FormData) {
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
  const documentId = String(formData.get("documentId") ?? "");
  const mode = String(formData.get("mode") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "PENDING") as DocumentVerificationStatus;
  const note = String(formData.get("note") ?? "").trim();
  const status: DocumentVerificationStatus = ["PENDING", "VERIFIED", "REJECTED"].includes(statusRaw)
    ? statusRaw
    : "PENDING";

  if (!studentId || !documentId) redirect(`/dashboard/students/${studentId}?tab=tasks`);

  const document = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
          user: { select: { name: true, email: true } },
        },
      },
      returnedBy: { select: { id: true } },
      verifiedBy: { select: { id: true, role: true } },
    },
  });
  if (!document || document.studentProfile.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = document.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentTasksUrl(studentId));
  }

  if (session.user.role === "SUB_ADMIN") {
    const isReverse = mode === "reverse";
    if (!isReverse) redirect(studentTasksUrl(studentId));
    if (document.verificationStatus !== "VERIFIED") redirect(`/dashboard/students/${studentId}?tab=tasks`);
    if (!["PENDING", "REJECTED"].includes(status) || !note) {
      redirect(`/dashboard/students/${studentId}?tab=tasks`);
    }

    const returnedAt = new Date();
    await prisma.studentDocument.update({
      where: { id: document.id },
      data: {
        verificationStatus: status,
        notes: note,
        returnedById: session.user.id,
        returnedAt,
        returnedNote: note,
        returnResolvedAt: null,
      },
    });

    if (document.verifiedBy && document.verifiedBy.role === "INTERNAL_STAFF") {
      await createWorkflowNotification({
        recipientId: document.verifiedBy.id,
        actorId: session.user.id,
        studentProfileId: document.studentProfileId,
        documentId: document.id,
        type: "DOCUMENT_RETURNED",
        title: "Document verification returned",
        message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${document.title} was returned to ${status}`,
        note,
        link: `/dashboard/students/${studentId}?tab=tasks`,
        actionRequired: true,
        metadata: { fromStatus: "VERIFIED", toStatus: status },
      });
    }

    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: document.studentProfileId,
        targetUserId: document.verifiedBy?.id ?? null,
        entityType: "DOCUMENT",
        entityId: document.id,
        action: `Returned verified document to ${status}`,
        metadata: { note, previousStatus: "VERIFIED", status },
      },
    });
  } else {
    await prisma.studentDocument.update({
      where: { id: document.id },
      data: {
        verificationStatus: status,
        notes: note || null,
        verifiedById: status === "VERIFIED" ? session.user.id : document.verifiedById,
        verifiedAt: status === "VERIFIED" ? new Date() : document.verifiedAt,
        returnResolvedAt:
          document.returnedAt && document.returnResolvedAt === null ? new Date() : document.returnResolvedAt,
      },
    });

    if (
      session.user.role === "INTERNAL_STAFF" &&
      status === "VERIFIED" &&
      document.returnedAt &&
      document.returnedById &&
      document.returnResolvedAt === null
    ) {
      await createWorkflowNotification({
        recipientId: document.returnedById,
        actorId: session.user.id,
        studentProfileId: document.studentProfileId,
        documentId: document.id,
        type: "DOCUMENT_REVERIFIED",
        title: "Returned document re-verified",
        message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${document.title} has been re-verified`,
        note: note || null,
        link: `/dashboard/students/${studentId}?tab=tasks`,
        actionRequired: true,
      });
    }

    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: document.studentProfileId,
        entityType: "DOCUMENT",
        entityId: document.id,
        action: `Set document verification status to ${status}`,
        metadata: note ? { note } : undefined,
      },
    });
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function disputeStudentDocumentReturnAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "INTERNAL_STAFF" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!studentId || !documentId || !note) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  const document = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: { where: { isActive: true }, select: { assignedToId: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!document || document.studentProfile.userId !== studentId || !document.returnedById) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = document.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentTasksUrl(studentId));
  }

  await prisma.studentDocument.update({
    where: { id: document.id },
    data: {
      returnResolvedAt: new Date(),
      notes: note,
    },
  });

  await createWorkflowNotification({
    recipientId: document.returnedById,
    actorId: session.user.id,
    studentProfileId: document.studentProfileId,
    documentId: document.id,
    type: "DOCUMENT_RETURN_DISPUTED",
    title: "Return disputed by internal staff",
    message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${document.title}`,
    note,
    link: `/dashboard/students/${studentId}?tab=tasks`,
    actionRequired: true,
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: document.studentProfileId,
      targetUserId: document.returnedById,
      entityType: "DOCUMENT",
      entityId: document.id,
      action: "Disputed returned document",
      metadata: { note },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function deleteStudentDocumentAction(formData: FormData) {
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
  const documentId = String(formData.get("documentId") ?? "");
  const doc = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    select: { id: true, storagePath: true, studentProfileId: true },
  });
  if (!doc) redirect(`/dashboard/students/${studentId}?tab=tasks`);

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfileId: doc.studentProfileId,
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect(studentTasksUrl(studentId));
    }
  }

  await deleteStoredFile(doc.storagePath);
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
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
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
  if (!studentId || !templateId) redirect(studentFinancialsUrl(studentId));

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
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
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const [student, template] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    }),
    prisma.emailTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!student || !student.studentProfile || !template) redirect(studentFinancialsUrl(studentId));

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
  if (!studentId || !templateId) redirect(studentFinancialsUrl(studentId));

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
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
    if (!assigned) redirect(studentFinancialsUrl(studentId));
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
  if (!student || !student.studentProfile || !template) redirect(studentFinancialsUrl(studentId));

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
  if (!contractId || !studentId) redirect(studentId ? studentFinancialsUrl(studentId) : "/dashboard");

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: { studentId, OR: [{ assignedToId: session.user.id }, { assignedToId: null }] },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
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
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, studentProfileId: true },
  });
  if (!contract) redirect(studentFinancialsUrl(studentId));

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
  redirect(studentFinancialsUrl(studentId));
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
  if (!invoiceId || !studentId) redirect(studentId ? studentFinancialsUrl(studentId) : "/dashboard");

  if (session.user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: { studentId, OR: [{ assignedToId: session.user.id }, { assignedToId: null }] },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
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
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentProfileId: true },
  });
  if (!invoice) redirect(studentFinancialsUrl(studentId));

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
  redirect(studentFinancialsUrl(studentId));
}

async function createLeadAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadName = String(formData.get("leadName") ?? "").trim();
  const phone = nullableText(formData.get("phone"));
  const email = nullableText(formData.get("email"));
  const source = nullableText(formData.get("source"));
  const sourceChannel = nullableText(formData.get("sourceChannel"));
  const campaignName = nullableText(formData.get("campaignName"));
  const accountSelection = String(formData.get("accountSelection") ?? "CREATE_NEW");
  const newAccountTypeRaw = String(formData.get("newAccountType") ?? "STUDENT");
  const newAccountName = String(formData.get("newAccountName") ?? "").trim();
  const existingAccountId = String(formData.get("existingAccountId") ?? "");
  const ownerIdRaw = String(formData.get("ownerId") ?? "");
  const ownerId = ownerIdRaw || null;
  const leadScore = clampLeadScore(Number(formData.get("leadScore") ?? 0));
  const parentName = nullableText(formData.get("parentName"));
  const parentPhone = nullableText(formData.get("parentPhone"));
  const parentEmail = nullableText(formData.get("parentEmail"));
  const nextFollowUpAt = parseOptionalDate(String(formData.get("nextFollowUpAt") ?? "").trim());
  const newAccountType =
    newAccountTypeRaw === "PARENT" ||
    newAccountTypeRaw === "PARTNER" ||
    newAccountTypeRaw === "INSTITUTION"
      ? newAccountTypeRaw
      : "STUDENT";

  if (!studentId || !leadName) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user, true);

  if (ownerId) {
    const ownerExists = await prisma.user.findFirst({
      where: { id: ownerId, role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] } },
      select: { id: true },
    });
    if (!ownerExists) redirect(`/dashboard/students/${studentId}`);
  }

  let accountId = "";
  if (accountSelection === "USE_EXISTING") {
    const existingAccount = await prisma.crmAccount.findUnique({
      where: { id: existingAccountId },
      select: { id: true },
    });
    if (!existingAccount) redirect(`/dashboard/students/${studentId}`);
    accountId = existingAccount.id;
  } else {
    if (!newAccountName) redirect(`/dashboard/students/${studentId}`);
    const tag = newAccountName.toLowerCase().includes("educationpro") ? "EducationPro" : null;
    const createdAccount = await prisma.crmAccount.create({
      data: {
        name: newAccountName,
        accountType: newAccountType,
        phone,
        email,
        source,
        tag,
      },
      select: { id: true },
    });
    accountId = createdAccount.id;
  }

  const lead = await prisma.lead.create({
    data: {
      name: leadName,
      phone,
      email,
      source,
      sourceChannel,
      campaignName,
      status: "NEW",
      ownerId,
      assignedAt: ownerId ? new Date() : null,
      leadScore,
      nextFollowUpAt,
      parentName,
      parentPhone,
      parentEmail,
      studentProfileId: access.studentProfileId,
      accountId,
    },
    select: { id: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: lead.id,
      action: "Lead created",
      metadata: {
        leadName,
        status: "NEW",
        accountSelection,
        accountId,
        ownerId,
        leadScore,
      },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  redirect(`/dashboard/students/${studentId}`);
}

async function convertLeadAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!studentId || !leadId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { opportunity: true },
  });
  if (!lead || lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (!canManageLead(session.user, lead.ownerId)) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (lead.status !== "QUALIFIED") {
    redirect(`/dashboard/students/${studentId}`);
  }

  if (!lead.opportunity) {
    await prisma.$transaction([
      prisma.opportunity.create({
        data: {
          leadId: lead.id,
          accountId: lead.accountId,
          name: `${lead.name} Opportunity`,
          amount: 0,
          probability: 25,
          expectedCloseDate: lead.nextFollowUpAt ?? null,
          forecastCategory: "PIPELINE",
          stage: "NEW",
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CONVERTED", convertedAt: new Date() },
      }),
    ]);
  }

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: lead.id,
      action: "Lead converted to opportunity",
      metadata: { fromStatus: "QUALIFIED", toStatus: "CONVERTED" },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateLeadQualificationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!studentId || !leadId) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, studentProfileId: true, ownerId: true },
  });
  if (!lead || lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (!canManageLead(session.user, lead.ownerId)) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const ownerIdRaw = String(formData.get("ownerId") ?? "");
  const ownerId = ownerIdRaw || null;
  if (ownerId) {
    const ownerExists = await prisma.user.findFirst({
      where: { id: ownerId, role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] } },
      select: { id: true },
    });
    if (!ownerExists) redirect(`/dashboard/students/${studentId}`);
  }

  const nextFollowUpAt = parseOptionalDate(String(formData.get("nextFollowUpAt") ?? "").trim());
  const leadScore = clampLeadScore(Number(formData.get("leadScore") ?? 0));
  const qualificationReason = nullableText(formData.get("qualificationReason"));
  const qualificationNotes = nullableText(formData.get("qualificationNotes"));

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      ownerId,
      assignedAt: ownerId ? new Date() : null,
      nextFollowUpAt,
      leadScore,
      qualificationReason,
      qualificationNotes,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: leadId,
      action: "Lead qualification details updated",
      metadata: { ownerId, leadScore, nextFollowUpAt, qualificationReason },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateLeadStatusAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const nextStatusRaw = String(formData.get("nextStatus") ?? "NEW") as LeadStatus;
  if (!studentId || !leadId) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, studentProfileId: true, status: true, ownerId: true, firstResponseAt: true },
  });
  if (!lead || lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (!canManageLead(session.user, lead.ownerId)) {
    redirect(`/dashboard/students/${studentId}`);
  }
  const nextStatus = sanitizeLeadStatus(nextStatusRaw);
  if (!canTransitionLeadStatus(lead.status, nextStatus)) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: nextStatus,
      convertedAt: nextStatus === "CONVERTED" ? new Date() : undefined,
      lastContactAt:
        nextStatus === "CONTACTED" || nextStatus === "QUALIFIED" || nextStatus === "NURTURE"
          ? new Date()
          : undefined,
      firstResponseAt:
        !lead.firstResponseAt &&
        (nextStatus === "CONTACTED" || nextStatus === "QUALIFIED" || nextStatus === "NURTURE")
          ? new Date()
          : undefined,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: leadId,
      action: `Lead status changed: ${formatLeadStatus(lead.status)} -> ${formatLeadStatus(nextStatus)}`,
      metadata: { fromStatus: lead.status, toStatus: nextStatus },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateOpportunityPipelineAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Opportunity";
  const amount = Number(formData.get("amount") ?? 0);
  const probability = clampPercent(Number(formData.get("probability") ?? 0));
  const expectedCloseDate = parseOptionalDate(String(formData.get("expectedCloseDate") ?? "").trim());
  const forecastCategoryRaw = String(formData.get("forecastCategory") ?? "PIPELINE");
  const stage = String(formData.get("stage") ?? "NEW") as OpportunityStage;
  const safeStage: OpportunityStage = ["NEW", "QUOTE_SENT", "CLOSED_WON", "CLOSED_LOST"].includes(stage)
    ? stage
    : "NEW";
  const forecastCategory: OpportunityForecastCategory =
    forecastCategoryRaw === "BEST_CASE" ||
    forecastCategoryRaw === "COMMIT" ||
    forecastCategoryRaw === "CLOSED"
      ? forecastCategoryRaw
      : "PIPELINE";

  if (!studentId || !opportunityId) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { lead: { select: { studentProfileId: true } } },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      name,
      amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
      probability,
      expectedCloseDate,
      forecastCategory,
      stage: safeStage,
      closedAt: safeStage === "CLOSED_WON" || safeStage === "CLOSED_LOST" ? new Date() : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "OPPORTUNITY",
      entityId: opportunityId,
      action: "Opportunity pipeline updated",
      metadata: {
        stage: safeStage,
        amount,
        probability,
        expectedCloseDate,
        forecastCategory,
      },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function createQuoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const description = nullableText(formData.get("description"));
  if (!studentId || !opportunityId || !Number.isFinite(amount) || amount < 0) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { lead: { select: { studentProfileId: true } } },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const quote = await prisma.quote.create({
    data: {
      opportunityId,
      amount,
      description,
      status: "DRAFT",
    },
    select: { id: true },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quote.id,
      action: "Created quote draft",
      metadata: { amount },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function submitQuoteForApprovalAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!studentId || !quoteId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { opportunity: { include: { lead: { select: { studentProfileId: true } } } } },
  });
  if (!quote || quote.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedById: session.user.id,
      },
    }),
    prisma.opportunity.update({
      where: { id: quote.opportunityId },
      data: { stage: "QUOTE_SENT" },
    }),
  ]);

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quoteId,
      action: "Submitted quote for approval",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function approveQuoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  const approvalNotes = nullableText(formData.get("approvalNotes"));
  if (!studentId || !quoteId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { opportunity: { include: { lead: { select: { studentProfileId: true } } } } },
  });
  if (!quote || quote.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: session.user.id,
      decisionedAt: new Date(),
      approvalNotes,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quoteId,
      action: "Quote approved",
      metadata: { approvalNotes },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function rejectQuoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  const approvalNotes = nullableText(formData.get("approvalNotes"));
  if (!studentId || !quoteId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { opportunity: { include: { lead: { select: { studentProfileId: true } } } } },
  });
  if (!quote || quote.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: "REJECTED",
      rejectedById: session.user.id,
      decisionedAt: new Date(),
      approvalNotes,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quoteId,
      action: "Quote rejected",
      metadata: { approvalNotes },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function closeOpportunityAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!studentId || !opportunityId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      lead: { select: { studentProfileId: true } },
      quotes: { select: { status: true } },
    },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  const approvedQuoteExists = opportunity.quotes.some((quote) => quote.status === "APPROVED");
  if (!approvedQuoteExists) redirect(`/dashboard/students/${studentId}`);

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { stage: "CLOSED_WON", closedAt: new Date(), forecastCategory: "CLOSED", probability: 100 },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "OPPORTUNITY",
      entityId: opportunityId,
      action: "Closed opportunity as won",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function convertOpportunityToCaseAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!studentId || !opportunityId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      lead: { select: { id: true, name: true, studentProfileId: true } },
      case: { select: { id: true } },
    },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (opportunity.stage !== "CLOSED_WON" || opportunity.case) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const createdCase = await prisma.case.create({
    data: {
      opportunityId,
      accountId: opportunity.accountId,
      title: `${opportunity.lead.name} Case`,
      description: "Case created from won opportunity.",
      status: "OPEN",
    },
    select: { id: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "CASE",
      entityId: createdCase.id,
      action: "Converted won opportunity to case",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateCaseAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = nullableText(formData.get("description"));
  const status = String(formData.get("status") ?? "OPEN") as CaseStatus;
  const assignedAgentIdRaw = String(formData.get("assignedAgentId") ?? "");
  const activityNote = nullableText(formData.get("activityNote"));
  const safeStatus: CaseStatus = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
    ? status
    : "OPEN";
  const assignedAgentId = assignedAgentIdRaw || null;
  if (!studentId || !caseId || !title) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const existingCase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      opportunity: { include: { lead: { select: { studentProfileId: true } } } },
    },
  });
  if (!existingCase || existingCase.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  if (assignedAgentId) {
    const assignedAgent = await prisma.user.findFirst({
      where: { id: assignedAgentId, role: "INTERNAL_STAFF" },
      select: { id: true },
    });
    if (!assignedAgent) redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.case.update({
    where: { id: caseId },
    data: {
      title,
      description,
      status: safeStatus,
      assignedAgentId,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "CASE",
      entityId: caseId,
      action: activityNote ? `Updated case: ${activityNote}` : "Updated case details",
      metadata: { status: safeStatus, assignedAgentId },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function ensureLeadWorkflowAccess(
  studentId: string,
  user: { id: string; role: string },
  createProfileIfMissing = false,
) {
  if (user.role !== "ADMIN" && user.role !== "SUB_ADMIN" && user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "USER" },
    select: { id: true, studentProfile: { select: { id: true } } },
  });
  if (!student) {
    redirect("/dashboard");
  }

  if (user.role === "SUB_ADMIN") {
    const assigned = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentOverviewUrl(studentId));
  }

  if (user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentOverviewUrl(studentId));
  }

  if (student.studentProfile) {
    return { studentProfileId: student.studentProfile.id };
  }
  if (!createProfileIfMissing) {
    redirect(studentOverviewUrl(studentId));
  }

  const createdProfile = await prisma.studentProfile.create({
    data: { userId: studentId },
    select: { id: true },
  });
  return { studentProfileId: createdProfile.id };
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

function sanitizeLeadStatus(status: LeadStatus): LeadStatus {
  if (
    status === "CONTACTED" ||
    status === "QUALIFIED" ||
    status === "NURTURE" ||
    status === "DISQUALIFIED" ||
    status === "CONVERTED"
  ) {
    return status;
  }
  return "NEW";
}

function canTransitionLeadStatus(current: LeadStatus, next: LeadStatus) {
  if (current === next) return true;
  const allowed: Record<LeadStatus, LeadStatus[]> = {
    NEW: ["CONTACTED", "QUALIFIED", "NURTURE", "DISQUALIFIED"],
    CONTACTED: ["QUALIFIED", "NURTURE", "DISQUALIFIED"],
    QUALIFIED: ["NURTURE", "DISQUALIFIED", "CONVERTED"],
    NURTURE: ["CONTACTED", "QUALIFIED", "DISQUALIFIED"],
    DISQUALIFIED: ["NURTURE", "CONTACTED"],
    CONVERTED: [],
  };
  return allowed[current].includes(next);
}

function canManageLead(user: { id: string; role: string }, ownerId?: string | null) {
  if (user.role === "ADMIN" || user.role === "SUB_ADMIN") return true;
  if (user.role === "INTERNAL_STAFF") return !ownerId || ownerId === user.id;
  return false;
}

function clampLeadScore(raw: number) {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function clampPercent(raw: number) {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function formatCrmAccountType(type: CrmAccountType) {
  if (type === "INSTITUTION") return "Institution";
  if (type === "PARENT") return "Parent/Sponsor";
  if (type === "PARTNER") return "Partner";
  return "Student";
}

function formatLeadStatus(status: LeadStatus) {
  if (status === "CONTACTED") return "Contacted";
  if (status === "QUALIFIED") return "Qualified";
  if (status === "NURTURE") return "Nurture";
  if (status === "DISQUALIFIED") return "Disqualified";
  if (status === "CONVERTED") return "Converted";
  return "New";
}

function leadStatusTone(status: LeadStatus) {
  if (status === "CONTACTED") return "bg-blue-50 text-blue-700";
  if (status === "QUALIFIED") return "bg-emerald-50 text-emerald-700";
  if (status === "NURTURE") return "bg-amber-50 text-amber-700";
  if (status === "DISQUALIFIED") return "bg-rose-50 text-rose-700";
  if (status === "CONVERTED") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

function formatOpportunityStage(stage: OpportunityStage) {
  if (stage === "QUOTE_SENT") return "Quote Sent";
  if (stage === "CLOSED_WON") return "Closed Won";
  if (stage === "CLOSED_LOST") return "Closed Lost";
  return "New";
}

function opportunityStageTone(stage: OpportunityStage) {
  if (stage === "QUOTE_SENT") return "bg-blue-50 text-blue-700";
  if (stage === "CLOSED_WON") return "bg-emerald-50 text-emerald-700";
  if (stage === "CLOSED_LOST") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function formatQuoteStatus(status: QuoteStatus) {
  if (status === "SUBMITTED") return "Submitted";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Draft";
}

function quoteStatusTone(status: QuoteStatus) {
  if (status === "SUBMITTED") return "bg-blue-50 text-blue-700";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function formatCaseStatus(status: CaseStatus) {
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "RESOLVED") return "Resolved";
  if (status === "CLOSED") return "Closed";
  return "Open";
}

function caseStatusTone(status: CaseStatus) {
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  if (status === "RESOLVED") return "bg-emerald-50 text-emerald-700";
  if (status === "CLOSED") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
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
