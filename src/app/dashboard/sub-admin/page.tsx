import type { SubmissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/roles";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { formatSubmissionStatus, submissionStatuses } from "@/lib/submission";
import { formatVisaStatus, formatYearsLeft } from "@/lib/student-tracking";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  country?: string;
  course?: string;
}>;

export default async function SubAdminDashboardPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN") {
    redirect(getDashboardPath(session.user.role));
  }

  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "";
  const country = searchParams.country ?? "";
  const course = searchParams.course ?? "";

  const scopedWhere = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
    includeUnassignedForSubAdmin: true,
  });

  const [submissions, pendingReviews, offersInProgress] = await Promise.all([
    prisma.questionnaireSubmission.findMany({
      where: scopedWhere,
      include: {
        student: {
          include: {
            studentProfile: true,
          },
        },
        template: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    prisma.questionnaireSubmission.count({
      where: {
        ...scopedWhere,
        status: {
          in: ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"],
        },
      },
    }),
    prisma.questionnaireSubmission.count({
      where: {
        ...scopedWhere,
        status: {
          in: ["OFFER_RECEIVED", "VISA_GRANTED", "ENROLLED"],
        },
      },
    }),
  ]);

  const assignedStudents = new Set(submissions.map((item) => item.studentId)).size;
  const today = new Date();
  const followUpNeeded = submissions.filter(
    (item) =>
      item.student.studentProfile?.nextFollowUpDate &&
      item.student.studentProfile.nextFollowUpDate <= today,
  ).length;
  const visaExpiringSoon = submissions.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = (visaExpiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 90;
  }).length;
  const exportUrl = `/api/submissions/export?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}`;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sub Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          View assigned students, review submissions, and update progress.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard title="Assigned Students" value={String(assignedStudents)} />
        <StatCard title="Pending Reviews" value={String(pendingReviews)} />
        <StatCard title="Offers in Progress" value={String(offersInProgress)} />
        <StatCard title="Follow-up Due" value={String(followUpNeeded)} />
        <StatCard title="Visa Expiring <=90d" value={String(visaExpiringSoon)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a href={exportUrl} className="rounded-md border px-3 py-2 text-sm">
          Export filtered CSV
        </a>
        {session.user.role === "ADMIN" ? (
          <Link href="/dashboard/admin" className="rounded-md border px-3 py-2 text-sm">
            Go to admin dashboard
          </Link>
        ) : null}
      </div>

      <form method="GET" className="rounded-lg border bg-white p-4">
        <p className="text-sm font-semibold">Filter submissions</p>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <input
            name="search"
            defaultValue={search}
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Search student/city/course"
          />
          <select name="status" defaultValue={status} className="rounded-md border px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="DOCS_REQUESTED">Docs Requested</option>
            <option value="OFFER_RECEIVED">Offer Received</option>
            <option value="VISA_GRANTED">Visa Granted</option>
            <option value="REJECTED">Rejected</option>
            <option value="ENROLLED">Enrolled</option>
          </select>
          <input
            name="country"
            defaultValue={country}
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Country"
          />
          <input
            name="course"
            defaultValue={course}
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Course"
          />
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">
            Apply
          </button>
        </div>
      </form>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Assigned Submissions</h2>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">
            No assigned submissions yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {submissions.map((submission) => (
              <article
                key={submission.id}
                className="rounded-md border border-gray-200 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {submission.student.name ?? submission.student.email}
                    </p>
                    <p className="text-xs text-gray-600">
                      {submission.intendedCourse ?? "Course not specified"} |{" "}
                      {submission.sourceCity ?? "City unknown"},{" "}
                      {submission.sourceCountry ?? "Country unknown"}
                    </p>
                    <p className="text-xs text-gray-600">
                      Current status: {formatSubmissionStatus(submission.status)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Visa:{" "}
                      {submission.student.studentProfile
                        ? formatVisaStatus(submission.student.studentProfile.visaStatus)
                        : "Not set"}{" "}
                      | Years left: {formatYearsLeft(submission.student.studentProfile?.courseEndDate)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Next follow-up:{" "}
                      {submission.student.studentProfile?.nextFollowUpDate
                        ? submission.student.studentProfile.nextFollowUpDate.toLocaleDateString()
                        : "Not scheduled"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/students/${submission.studentId}`}
                      className="rounded-md border border-gray-300 px-3 py-1 text-sm"
                    >
                      View profile
                    </Link>
                    <form action={updateSubmissionStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <select
                        name="status"
                        defaultValue={submission.status}
                        className="rounded-md border px-2 py-1 text-sm"
                      >
                        {submissionStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatSubmissionStatus(status)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md bg-black px-3 py-1 text-sm text-white"
                      >
                        Update
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </article>
  );
}

async function updateSubmissionStatusAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  const status = String(formData.get("status") ?? "") as SubmissionStatus;

  if (!submissionStatuses.includes(status)) {
    redirect("/dashboard/sub-admin");
  }

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    select: { assignedToId: true },
  });

  if (!submission) {
    redirect("/dashboard/sub-admin");
  }

  if (session.user.role === "SUB_ADMIN" && submission.assignedToId !== session.user.id) {
    if (submission.assignedToId !== null) {
      redirect("/dashboard/sub-admin");
    }
  }

  await prisma.questionnaireSubmission.update({
    where: { id: submissionId },
    data:
      session.user.role === "SUB_ADMIN" && submission.assignedToId === null
        ? { status, assignedToId: session.user.id }
        : { status },
  });

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/student");
  redirect("/dashboard/sub-admin");
}
