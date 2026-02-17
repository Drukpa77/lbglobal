import type { Prisma, VisaStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatVisaStatus, formatYearsLeft, visaStatuses } from "@/lib/student-tracking";

type Params = Promise<{ studentId: string }>;

export default async function StudentProfileManagementPage(props: { params: Params }) {
  const { studentId } = await props.params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
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

  const submissionAnswers = getAnswerEntries(latestSubmission?.answers);
  const backLink =
    session.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/sub-admin";
  const profile = student.studentProfile;

  return (
    <section className="space-y-6 text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Student Profile Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create or edit profile for {student.name ?? student.email}
          </p>
        </div>
        <Link href={backLink} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          Back to dashboard
        </Link>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Student Details and Tracking Summary</h2>
        <div className="mt-2 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
          <p>
            <span className="font-semibold">Name:</span> {student.name ?? "N/A"}
          </p>
          <p>
            <span className="font-semibold">Email:</span> {student.email}
          </p>
          <p>
            <span className="font-semibold">Assigned Agent:</span>{" "}
            {latestSubmission?.assignedSubAdmin?.name ??
              latestSubmission?.assignedSubAdmin?.email ??
              "Unassigned"}
          </p>
          <p>
            <span className="font-semibold">Last Submission:</span>{" "}
            {latestSubmission ? latestSubmission.submittedAt.toLocaleString() : "No submission"}
          </p>
          <p>
            <span className="font-semibold">Visa Status:</span>{" "}
            {profile ? formatVisaStatus(profile.visaStatus) : "Not set"}
          </p>
          <p>
            <span className="font-semibold">Years Left to Study:</span>{" "}
            {formatYearsLeft(profile?.courseEndDate)}
          </p>
          <p>
            <span className="font-semibold">Next Follow-up:</span>{" "}
            {profile?.nextFollowUpDate ? profile.nextFollowUpDate.toLocaleDateString() : "Not set"}
          </p>
        </div>
      </div>

      <form action={saveStudentProfileAction} className="space-y-4 rounded-lg border bg-white p-5">
        <input type="hidden" name="studentId" value={student.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Date of Birth">
            <input
              type="date"
              name="dateOfBirth"
              defaultValue={formatDateInput(student.studentProfile?.dateOfBirth)}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Phone">
            <input
              type="text"
              name="phone"
              defaultValue={student.studentProfile?.phone ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              name="city"
              defaultValue={student.studentProfile?.city ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Nationality">
            <input
              type="text"
              name="nationality"
              defaultValue={student.studentProfile?.nationality ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Current Education Level">
            <input
              type="text"
              name="currentEducationLevel"
              defaultValue={student.studentProfile?.currentEducationLevel ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Target Course">
            <input
              type="text"
              name="targetCourse"
              defaultValue={student.studentProfile?.targetCourse ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Preferred Intake">
            <input
              type="text"
              name="preferredIntake"
              defaultValue={student.studentProfile?.preferredIntake ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="English Test Score">
            <input
              type="text"
              name="englishTestScore"
              defaultValue={student.studentProfile?.englishTestScore ?? ""}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Visa Status">
            <select
              name="visaStatus"
              defaultValue={student.studentProfile?.visaStatus ?? "NOT_STARTED"}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
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
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Course End Date">
            <input
              type="date"
              name="courseEndDate"
              defaultValue={formatDateInput(student.studentProfile?.courseEndDate)}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Visa Expiry Date">
            <input
              type="date"
              name="visaExpiryDate"
              defaultValue={formatDateInput(student.studentProfile?.visaExpiryDate)}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Last Follow-up Date">
            <input
              type="date"
              name="lastFollowUpDate"
              defaultValue={formatDateInput(student.studentProfile?.lastFollowUpDate)}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
          <Field label="Next Follow-up Date">
            <input
              type="date"
              name="nextFollowUpDate"
              defaultValue={formatDateInput(student.studentProfile?.nextFollowUpDate)}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </Field>
        </div>
        <Field label="Follow-up Notes">
          <textarea
            name="followUpNotes"
            defaultValue={student.studentProfile?.followUpNotes ?? ""}
            className="mt-1 min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>
        <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
          Save Profile
        </button>
      </form>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Latest Questionnaire Answers</h2>
        {submissionAnswers.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No questionnaire answers found.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {submissionAnswers.map(([key, value]) => (
              <div key={key} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {key}
                </p>
                <p className="mt-1 text-sm text-gray-900">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
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
    <label className="block text-sm">
      {label}
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

  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
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

  const dateOfBirthRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const dateOfBirth = parseOptionalDate(dateOfBirthRaw);
  const courseStartDate = parseOptionalDate(String(formData.get("courseStartDate") ?? "").trim());
  const courseEndDate = parseOptionalDate(String(formData.get("courseEndDate") ?? "").trim());
  const visaExpiryDate = parseOptionalDate(String(formData.get("visaExpiryDate") ?? "").trim());
  const lastFollowUpDate = parseOptionalDate(String(formData.get("lastFollowUpDate") ?? "").trim());
  const nextFollowUpDate = parseOptionalDate(String(formData.get("nextFollowUpDate") ?? "").trim());
  const visaStatusRaw = String(formData.get("visaStatus") ?? "NOT_STARTED") as VisaStatus;
  const visaStatus = visaStatuses.includes(visaStatusRaw) ? visaStatusRaw : "NOT_STARTED";

  await prisma.studentProfile.upsert({
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
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/student");
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
