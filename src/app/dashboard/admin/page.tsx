import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminAnalyticsCharts } from "@/components/admin-analytics-charts";
import { prisma } from "@/lib/prisma";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { formatSubmissionStatus } from "@/lib/submission";
import { formatVisaStatus, formatYearsLeft } from "@/lib/student-tracking";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  country?: string;
  course?: string;
}>;

export default async function AdminDashboardPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "";
  const country = searchParams.country ?? "";
  const course = searchParams.course ?? "";

  const filteredWhere = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
  });

  const [
    totalStudents,
    submissionsCount,
    activeSubAdmins,
    convertedCount,
    byCountry,
    byCourse,
    byIntake,
    recentSubmissions,
    filteredSubmissions,
    subAdmins,
    funnelCounts,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.questionnaireSubmission.count(),
    prisma.user.count({ where: { role: "SUB_ADMIN" } }),
    prisma.questionnaireSubmission.count({
      where: { status: { in: ["OFFER_RECEIVED", "VISA_GRANTED", "ENROLLED"] } },
    }),
    prisma.questionnaireSubmission.groupBy({
      by: ["sourceCountry"],
      where: { sourceCountry: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { sourceCountry: "desc" } },
      take: 5,
    }),
    prisma.questionnaireSubmission.groupBy({
      by: ["intendedCourse"],
      where: { intendedCourse: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { intendedCourse: "desc" } },
      take: 5,
    }),
    prisma.questionnaireSubmission.groupBy({
      by: ["intendedIntake"],
      where: { intendedIntake: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { intendedIntake: "desc" } },
      take: 5,
    }),
    prisma.questionnaireSubmission.findMany({
      include: {
        student: {
          include: {
            studentProfile: true,
          },
        },
        assignedSubAdmin: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 8,
    }),
    prisma.questionnaireSubmission.findMany({
      where: filteredWhere,
      include: {
        student: {
          include: {
            studentProfile: true,
          },
        },
        assignedSubAdmin: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    prisma.user.findMany({
      where: { role: "SUB_ADMIN" },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.questionnaireSubmission.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const offerRate =
    submissionsCount === 0 ? "0%" : `${Math.round((convertedCount / submissionsCount) * 100)}%`;

  const countryItems = byCountry.filter((item) => item.sourceCountry);
  const courseItems = byCourse.filter((item) => item.intendedCourse);
  const intakeItems = byIntake.filter((item) => item.intendedIntake);
  const funnelItems = funnelCounts.map((item) => ({
    label: formatSubmissionStatus(item.status),
    value: item._count._all,
  }));
  const countryChartData = countryItems.map((item) => ({
    label: item.sourceCountry as string,
    value: item._count._all,
  }));
  const courseChartData = courseItems.map((item) => ({
    label: item.intendedCourse as string,
    value: item._count._all,
  }));

  const exportUrl = `/api/submissions/export?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}`;
  const today = new Date();
  const followUpDue = filteredSubmissions.filter(
    (item) =>
      item.student.studentProfile?.nextFollowUpDate &&
      item.student.studentProfile.nextFollowUpDate <= today,
  ).length;
  const visaExpiringSoon = filteredSubmissions.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = (visaExpiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 90;
  }).length;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Full system visibility for students, agents, applications, and regional
          interest trends.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <StatCard title="Total Students" value={String(totalStudents)} />
        <StatCard title="Submissions" value={String(submissionsCount)} />
        <StatCard title="Active Sub Admins" value={String(activeSubAdmins)} />
        <StatCard title="Offer Rate" value={offerRate} />
        <StatCard title="Follow-up Due" value={String(followUpDue)} />
        <StatCard title="Visa Expiring <=90d" value={String(visaExpiringSoon)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/admin/questionnaire" className="rounded-md border px-3 py-2 text-sm">
          Manage questionnaire template
        </Link>
        <a href={exportUrl} className="rounded-md border px-3 py-2 text-sm">
          Export filtered CSV
        </a>
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

      <AdminAnalyticsCharts byCountry={countryChartData} byCourse={courseChartData} funnel={funnelItems} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold">Applications by Location</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {countryItems.length === 0 ? (
              <li>No data yet</li>
            ) : (
              countryItems.map((item) => (
                <li key={item.sourceCountry}>
                  {item.sourceCountry}: {item._count._all}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold">Popular Courses / Intakes</h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-gray-600">Courses</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {courseItems.length === 0 ? (
                  <li>No data yet</li>
                ) : (
                  courseItems.map((item) => (
                    <li key={item.intendedCourse}>
                      {item.intendedCourse}: {item._count._all}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600">Intakes</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {intakeItems.length === 0 ? (
                  <li>No data yet</li>
                ) : (
                  intakeItems.map((item) => (
                    <li key={item.intendedIntake}>
                      {item.intendedIntake}: {item._count._all}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Filtered Submissions & Assignment</h2>
        {filteredSubmissions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No submissions match current filters.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {filteredSubmissions.map((submission) => (
              <article key={submission.id} className="rounded-md border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {submission.student.name ?? submission.student.email}
                    </p>
                    <p className="text-xs text-gray-600">
                      {submission.sourceCity ?? "Unknown city"},{" "}
                      {submission.sourceCountry ?? "Unknown country"} |{" "}
                      {submission.intendedCourse ?? "No course"}
                    </p>
                    <p className="text-xs text-gray-600">
                      Status: {formatSubmissionStatus(submission.status)}
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
                    <form action={assignSubAdminAction} className="flex items-center gap-2">
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <select
                        name="subAdminId"
                        defaultValue={submission.assignedToId ?? ""}
                        className="rounded-md border px-2 py-1 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {subAdmins.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name ?? agent.email}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md bg-black px-3 py-1 text-sm text-white"
                      >
                        Save
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Recent Activity Snapshot</h2>
        {recentSubmissions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No activity yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-gray-700">
            {recentSubmissions.map((submission) => (
              <li key={submission.id}>
                {submission.student.name ?? submission.student.email} submitted from{" "}
                {submission.sourceCountry ?? "Unknown"} ({formatSubmissionStatus(submission.status)})
              </li>
            ))}
          </ul>
        )}
      </section>
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

async function assignSubAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  const subAdminIdRaw = String(formData.get("subAdminId") ?? "");
  const subAdminId = subAdminIdRaw || null;

  if (subAdminId) {
    const subAdmin = await prisma.user.findFirst({
      where: { id: subAdminId, role: "SUB_ADMIN" },
      select: { id: true },
    });
    if (!subAdmin) {
      redirect("/dashboard/admin");
    }
  }

  await prisma.questionnaireSubmission.update({
    where: { id: submissionId },
    data: { assignedToId: subAdminId },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/student");
  redirect("/dashboard/admin");
}
