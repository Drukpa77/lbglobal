import type { SubmissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardTabBar } from "@/components/dashboard-tab-bar";
import { RemindersWidget } from "@/components/reminders-widget";
import { SubAdminHelp } from "@/components/sub-admin-help";
import { prisma } from "@/lib/prisma";
import { getRemindersForUser } from "@/lib/reminders";
import { getDashboardPath } from "@/lib/roles";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { formatSubmissionStatus, submissionStatuses } from "@/lib/submission";
import { formatVisaStatus, formatYearsLeft } from "@/lib/student-tracking";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  country?: string;
  course?: string;
  queue?: string;
  tab?: string;
}>;

export default async function SubAdminDashboardPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const tab = (searchParams.tab ?? "overview") as "overview" | "students" | "team";
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
  const queueRaw = searchParams.queue ?? "all";
  const queueFilter: "all" | "unassigned" | "overdue" | "needs_approval" =
    queueRaw === "unassigned" || queueRaw === "overdue" || queueRaw === "needs_approval"
      ? queueRaw
      : "all";

  const scopedWhere = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
    includeUnassignedForSubAdmin: true,
  });

  const today = new Date();
  const trendWindowStart = new Date(today);
  trendWindowStart.setDate(trendWindowStart.getDate() - 56);

  const [reminders, submissions, trendSubmissions, pendingReviews, offersInProgress, homePosts, teamMembers, activeAssignments, openTaskCount, allInternalStaff] =
    await Promise.all([
      getRemindersForUser(session.user.role as "ADMIN" | "SUB_ADMIN", session.user.id),
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
      prisma.questionnaireSubmission.findMany({
        where: {
          ...scopedWhere,
          submittedAt: { gte: trendWindowStart },
        },
        select: {
          status: true,
          submittedAt: true,
          updatedAt: true,
        },
        orderBy: { submittedAt: "asc" },
        take: 500,
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
    prisma.homePost.findMany({
      where:
        session.user.role === "ADMIN"
          ? undefined
          : {
              authorId: session.user.id,
            },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.staffTeamMembership.findMany({
      where:
        session.user.role === "ADMIN"
          ? undefined
          : {
              managerId: session.user.id,
            },
      include: {
        internalStaff: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.studentAssignment.findMany({
      where:
        session.user.role === "ADMIN"
          ? { isActive: true }
          : {
              isActive: true,
              assignedById: session.user.id,
            },
      include: {
        studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
      prisma.task.count({
        where:
          session.user.role === "ADMIN"
            ? { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } }
            : {
                assignerId: session.user.id,
                status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
              },
      }),
      prisma.user.findMany({
        where: { role: "INTERNAL_STAFF" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const assignedStudents = new Set(submissions.map((item) => item.studentId)).size;
  const studentProfileIds = submissions
    .map((item) => item.student.studentProfile?.id)
    .filter((id): id is string => Boolean(id));
  const teamStaffIds = Array.from(new Set(teamMembers.map((member) => member.internalStaff.id)));
  const [
    draftContractsCount,
    draftInvoicesCount,
    pendingDocumentsCount,
    teamTaskLoad,
    teamCaseLoad,
    draftContractProfiles,
    draftInvoiceProfiles,
    pendingDocumentProfiles,
  ] = await Promise.all([
    prisma.contract.count({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
    }),
    prisma.invoice.count({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
    }),
    prisma.studentDocument.count({
      where: {
        verificationStatus: "PENDING",
        studentProfileId: { in: studentProfileIds },
      },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        assigneeId: { in: teamStaffIds },
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      },
      _count: { _all: true },
    }),
    prisma.studentAssignment.groupBy({
      by: ["assignedToId"],
      where: {
        isActive: true,
        assignedToId: { in: teamStaffIds },
      },
      _count: { _all: true },
    }),
    prisma.contract.findMany({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
      select: { studentProfileId: true },
    }),
    prisma.invoice.findMany({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
      select: { studentProfileId: true },
    }),
    prisma.studentDocument.findMany({
      where: {
        verificationStatus: "PENDING",
        studentProfileId: { in: studentProfileIds },
      },
      select: { studentProfileId: true },
    }),
  ]);

  const visaExpiringSoon = submissions.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 90;
  }).length;
  const exportUrl = `/api/submissions/export?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}`;
  const latestSubmissionPerStudent = dedupeLatestSubmissionPerStudent(submissions);
  const visaExpiringSoonItems = latestSubmissionPerStudent.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 90;
  });
  const autoFollowUpItems = latestSubmissionPerStudent.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 120 && days <= 150;
  });
  const pendingItems = latestSubmissionPerStudent.filter((item) =>
    ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"].includes(item.status),
  );
  const offerInProgressItems = latestSubmissionPerStudent.filter((item) =>
    ["OFFER_RECEIVED", "VISA_GRANTED"].includes(item.status),
  );
  const enrolledItems = latestSubmissionPerStudent.filter((item) => item.status === "ENROLLED");
  const rejectedItems = latestSubmissionPerStudent.filter((item) => item.status === "REJECTED");
  const unassignedItems = latestSubmissionPerStudent.filter((item) => item.assignedToId === null);
  const pendingApprovalsCount = draftContractsCount + draftInvoicesCount + pendingDocumentsCount;
  const overdueFollowUpsCount = latestSubmissionPerStudent.filter((item) => {
    const next = item.student.studentProfile?.nextFollowUpDate;
    return next ? daysUntilDate(next, today) < 0 : false;
  }).length;
  const taskLoadByStaff = new Map(teamTaskLoad.map((row) => [row.assigneeId, row._count._all]));
  const caseLoadByStaff = new Map(teamCaseLoad.map((row) => [row.assignedToId, row._count._all]));
  const staffWorkloads = teamMembers
    .map((member) => {
      const openTasks = taskLoadByStaff.get(member.internalStaff.id) ?? 0;
      const activeCases = caseLoadByStaff.get(member.internalStaff.id) ?? 0;
      return {
        id: member.internalStaff.id,
        name: member.internalStaff.name ?? member.internalStaff.email,
        email: member.internalStaff.email,
        openTasks,
        activeCases,
      };
    })
    .sort((a, b) => b.openTasks - a.openTasks);
  const overloadedStaffCount = staffWorkloads.filter((staff) => staff.openTasks >= 8 || staff.activeCases >= 15).length;
  const suggestedAssigneeId =
    staffWorkloads.length > 0
      ? [...staffWorkloads].sort((a, b) => a.openTasks + a.activeCases - (b.openTasks + b.activeCases))[0].id
      : "";
  const approvalProfileSet = new Set([
    ...draftContractProfiles.map((item) => item.studentProfileId),
    ...draftInvoiceProfiles.map((item) => item.studentProfileId),
    ...pendingDocumentProfiles.map((item) => item.studentProfileId),
  ]);
  const filteredSubmissions = submissions.filter((submission) => {
    if (queueFilter === "unassigned") return submission.assignedToId === null;
    if (queueFilter === "overdue") {
      const nextFollowUpDate = submission.student.studentProfile?.nextFollowUpDate;
      return nextFollowUpDate ? daysUntilDate(nextFollowUpDate, today) < 0 : false;
    }
    if (queueFilter === "needs_approval") {
      const profileId = submission.student.studentProfile?.id;
      return profileId ? approvalProfileSet.has(profileId) : false;
    }
    return true;
  });
  const queueFilterLabel =
    queueFilter === "unassigned"
      ? "Unassigned Cases"
      : queueFilter === "overdue"
        ? "Overdue Follow-ups"
        : queueFilter === "needs_approval"
          ? "Needs Approval"
          : "All Cases";
  const managerReportUrl = `/api/sub-admin/report?queue=${encodeURIComponent(queueFilter)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}`;
  const trendBuckets = buildWeeklyTrendBuckets(trendSubmissions);
  const avgReviewHours = calculateAverageReviewHours(trendSubmissions);
  const conversionRate =
    submissions.length > 0 ? Math.round((enrolledItems.length / submissions.length) * 100) : 0;
  const pendingRatio = submissions.length > 0 ? Math.round((pendingItems.length / submissions.length) * 100) : 0;
  const highVisaRiskItems = latestSubmissionPerStudent.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 30;
  });
  const missingFollowUpItems = latestSubmissionPerStudent.filter((item) => {
    const needsFollowUp = ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED", "OFFER_RECEIVED"].includes(item.status);
    if (!needsFollowUp) return false;
    return !item.student.studentProfile?.nextFollowUpDate;
  });
  const pendingDocRiskItems = latestSubmissionPerStudent.filter((item) => {
    const profileId = item.student.studentProfile?.id;
    return profileId ? approvalProfileSet.has(profileId) : false;
  });
  const slaBreachItems = latestSubmissionPerStudent.filter((item) => {
    const pendingTooLong =
      ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"].includes(item.status) &&
      daysUntilDate(today, item.submittedAt) > 7;
    const overdueFollowUp = item.student.studentProfile?.nextFollowUpDate
      ? daysUntilDate(item.student.studentProfile.nextFollowUpDate, today) < -3
      : false;
    return pendingTooLong || overdueFollowUp;
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          View assigned students, track applications, and manage team operations.
        </p>
      </div>

      <SubAdminHelp />

      <DashboardTabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "students", label: "Students", count: assignedStudents },
          { id: "team", label: "Team & Operations" },
        ]}
        activeTab={tab}
      />

      {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {reminders.length > 0 && (
            <RemindersWidget reminders={reminders} title="Reminders" maxItems={8} />
          )}

          <section className="grid gap-4 md:grid-cols-5">
            <StatCard title="Pending Approvals" value={String(pendingApprovalsCount)} />
            <StatCard title="Unassigned Cases" value={String(unassignedItems.length)} />
            <StatCard title="Team Overloaded" value={String(overloadedStaffCount)} />
            <StatCard title="Overdue Follow-ups" value={String(overdueFollowUpsCount)} />
            <StatCard title="Team Members" value={String(teamMembers.length)} />
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Manager Analytics</h2>
                <p className="mt-1 text-xs text-gray-600">Weekly health and operational performance snapshot.</p>
              </div>
              <a href={managerReportUrl} className="rounded-md border px-3 py-1.5 text-xs font-medium">
                Download Weekly Manager Report
              </a>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <StatCard title="Conversion Rate (Enrolled)" value={`${conversionRate}%`} />
              <StatCard title="Pending Ratio" value={`${pendingRatio}%`} />
              <StatCard title="Avg Review Time" value={`${avgReviewHours}h`} />
              <StatCard title="Escalation Queue" value={String(slaBreachItems.length)} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {trendBuckets.map((bucket) => (
                <article key={bucket.label} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{bucket.label}</p>
                  <p className="mt-1 text-sm text-gray-800">
                    {bucket.submitted} submitted · {bucket.resolved} resolved
                  </p>
                  <p className="text-xs text-gray-600">{bucket.pending} pending</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">Risk Board</h2>
              <p className="mt-1 text-xs text-gray-600">High-priority cases needing intervention.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <RiskBucket
                  title="Visa Expiring <=30d"
                  items={highVisaRiskItems}
                  emptyLabel="No critical visa expiries."
                />
                <RiskBucket
                  title="Missing Follow-up Date"
                  items={missingFollowUpItems}
                  emptyLabel="All tracked cases have follow-up dates."
                />
                <RiskBucket
                  title="Pending Docs/Approvals"
                  items={pendingDocRiskItems}
                  emptyLabel="No pending approval risk."
                />
              </div>
            </article>

            <article className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">SLA Breach Alerts</h2>
                <p className="text-xs text-gray-600">{slaBreachItems.length} flagged</p>
              </div>
              {slaBreachItems.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">No SLA breaches right now.</p>
              ) : (
                <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {slaBreachItems.map((item) => (
                    <li key={item.id} className="rounded-md border border-gray-200 p-2">
                      <p className="text-sm font-medium">{item.student.name ?? item.student.email}</p>
                      <p className="text-xs text-gray-600">
                        {formatSubmissionStatus(item.status)} · submitted {item.submittedAt.toLocaleDateString()}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link href={`/dashboard/students/${item.studentId}`} className="rounded-md border px-2 py-1 text-xs">
                          Open
                        </Link>
                        <form action={escalateSubmissionAction}>
                          <input type="hidden" name="submissionId" value={item.id} />
                          <input type="hidden" name="reason" value="SLA breach alert from sub-admin dashboard" />
                          <button
                            type="submit"
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                          >
                            Escalate
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </div>
      )}

      {/* ── STUDENTS TAB ───────────────────────────────────────── */}
      {tab === "students" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            <StatCard title="Assigned Students" value={String(assignedStudents)} />
            <StatCard title="Pending Reviews" value={String(pendingReviews)} />
            <StatCard title="Offers in Progress" value={String(offersInProgress)} />
            <StatCard title="Open Delegated Tasks" value={String(openTaskCount)} />
            <StatCard title="Visa Expiring <=90d" value={String(visaExpiringSoon)} />
          </div>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Saved Triage Filters</h2>
              <p className="text-xs text-gray-600">Current: {queueFilterLabel}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <QueueFilterButton label="All Cases" queue="all" current={queueFilter} tab="students" />
              <QueueFilterButton label="Unassigned" queue="unassigned" current={queueFilter} tab="students" />
              <QueueFilterButton label="Overdue" queue="overdue" current={queueFilter} tab="students" />
              <QueueFilterButton label="Needs Approval" queue="needs_approval" current={queueFilter} tab="students" />
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Students Categorized by Priority</h2>
            <p className="mt-1 text-xs text-gray-600">
              Click any student to open profile and update details.
            </p>
            <div className="mt-3 max-h-[28rem] overflow-y-auto pr-1">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <CategoryCard
                  title="Visa Expiring Soon (<=90d)"
                  items={visaExpiringSoonItems}
                  emptyLabel="No students with upcoming visa expiry."
                />
                <CategoryCard
                  title="Auto Follow-up (Visa expiring in 4-5 months)"
                  items={autoFollowUpItems}
                  emptyLabel="No students currently in the 4-5 month follow-up window."
                />
                <CategoryCard
                  title="Pending Review"
                  items={pendingItems}
                  emptyLabel="No students in pending stage."
                />
                <CategoryCard
                  title="Offer In Progress"
                  items={offerInProgressItems}
                  emptyLabel="No students in offer/visa processing stage."
                />
                <CategoryCard
                  title="Enrolled"
                  items={enrolledItems}
                  emptyLabel="No enrolled students in this view."
                />
                <CategoryCard
                  title="Rejected"
                  items={rejectedItems}
                  emptyLabel="No rejected students in this view."
                />
              </div>
            </div>
          </section>

          <form method="GET" className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Filter submissions</p>
              <a href={exportUrl} className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                Export filtered CSV
              </a>
            </div>
            <input type="hidden" name="tab" value="students" />
            <input type="hidden" name="queue" value={queueFilter} />
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Assigned Submissions</h2>
              <p className="text-xs text-gray-600">
                {filteredSubmissions.length} results · filter: {queueFilterLabel}
              </p>
            </div>
            {filteredSubmissions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No submissions in this queue.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <form
                  id="bulk-submission-status-form"
                  action={bulkUpdateSubmissionStatusAction}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2"
                >
                  <select
                    name="status"
                    required
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    defaultValue="UNDER_REVIEW"
                  >
                    {submissionStatuses.map((statusItem) => (
                      <option key={statusItem} value={statusItem}>
                        {formatSubmissionStatus(statusItem)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm">
                    Apply status to selected
                  </button>
                </form>
                <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {filteredSubmissions.map((submission) => (
                  <article key={submission.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <label className="mb-1 flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            name="submissionIds"
                            value={submission.id}
                            form="bulk-submission-status-form"
                            className="h-4 w-4"
                          />
                          Select for bulk update
                        </label>
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
                          <button type="submit" className="rounded-md bg-black px-3 py-1 text-sm text-white">
                            Update
                          </button>
                        </form>
                        {allInternalStaff.length > 0 && submission.student.studentProfile ? (
                          <form action={delegateStudentToInternalStaffAction} className="flex items-center gap-2">
                            <input type="hidden" name="studentId" value={submission.studentId} />
                            <select
                              name="internalStaffId"
                              defaultValue={suggestedAssigneeId}
                              className="rounded-md border px-2 py-1 text-sm"
                            >
                              <option value="">Delegate to staff</option>
                              {allInternalStaff.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {(staff.name ?? staff.email) +
                                    (staff.id === suggestedAssigneeId ? " (Suggested)" : "")}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="rounded-md border px-3 py-1 text-sm">
                              Delegate
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEAM & OPERATIONS TAB ──────────────────────────────── */}
      {tab === "team" && (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">Approval Queue</h2>
              <p className="mt-1 text-xs text-gray-600">Items waiting for review or send decision.</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <span>Draft Contracts</span>
                  <span className="font-semibold">{draftContractsCount}</span>
                </li>
                <li className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <span>Draft Invoices</span>
                  <span className="font-semibold">{draftInvoicesCount}</span>
                </li>
                <li className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <span>Pending Doc Verification</span>
                  <span className="font-semibold">{pendingDocumentsCount}</span>
                </li>
              </ul>
              <Link href="/dashboard/communication" className="mt-3 inline-block rounded-md border px-3 py-1.5 text-xs">
                Open internal comms
              </Link>
            </article>

            <article className="rounded-lg border bg-white p-4 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Assignment Board</h2>
                <p className="text-xs text-gray-600">Unassigned cases and team workload</p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unassigned Cases</p>
                  {unassignedItems.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">No unassigned cases.</p>
                  ) : (
                    <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {unassignedItems.slice(0, 10).map((item) => (
                        <li key={item.id} className="rounded-md border border-gray-200 p-2">
                          <p className="text-xs font-semibold">{item.student.name ?? item.student.email}</p>
                          <p className="text-[11px] text-gray-600">{formatSubmissionStatus(item.status)}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Link
                              href={`/dashboard/students/${item.studentId}`}
                              className="rounded-md border border-gray-300 px-2 py-1 text-[11px]"
                            >
                              Open
                            </Link>
                            <form action={claimSubmissionAction}>
                              <input type="hidden" name="submissionId" value={item.id} />
                              <button type="submit" className="rounded-md border border-gray-300 px-2 py-1 text-[11px]">
                                Claim
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team Workload</p>
                  {staffWorkloads.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">No internal staff members linked.</p>
                  ) : (
                    <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {staffWorkloads.map((staff) => (
                        <li key={staff.id} className="rounded-md border border-gray-200 p-2">
                          <p className="text-xs font-semibold">{staff.name}</p>
                          <p className="text-[11px] text-gray-600">
                            {staff.activeCases} active cases · {staff.openTasks} open tasks
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Delegation Snapshot</h2>
            <p className="mt-1 text-xs text-gray-600">
              Team members linked to you: {teamMembers.length}
            </p>
            {activeAssignments.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No delegated student assignments yet.</p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {activeAssignments.map((assignment) => (
                  <li key={assignment.id} className="rounded-md border border-gray-200 p-2">
                    <p className="text-sm font-medium">
                      {assignment.studentProfile.user.name ?? assignment.studentProfile.user.email}
                    </p>
                    <p className="text-xs text-gray-600">
                      Assigned to {assignment.assignedTo.name ?? assignment.assignedTo.email}
                    </p>
                    <Link href={`/dashboard/students/${assignment.studentProfile.user.id}`} className="mt-1 inline-block text-xs text-blue-600 underline">
                      Open student profile
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Your Home Page Posts</h2>
              <Link href="/dashboard/posts/new" className="rounded-md border px-3 py-1 text-sm">
                New post
              </Link>
            </div>
            {homePosts.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No posts yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-3">
                {homePosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/dashboard/posts/${post.id}/edit`}
                    className="w-64 shrink-0 rounded-md border border-gray-200 p-2 transition hover:border-rose-300"
                  >
                    <div className="h-28 overflow-hidden rounded-md border bg-gray-50">
                      {post.mediaType === "IMAGE" && post.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.mediaUrl} alt={post.title} className="h-full w-full object-cover" />
                      ) : post.mediaType === "VIDEO" && post.mediaUrl ? (
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">
                          Video post
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">
                          Text post
                        </div>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm font-semibold">{post.title}</p>
                    <p className="text-xs text-gray-600">
                      {post.author.name ?? post.author.email} · {post.createdAt.toLocaleDateString()}
                    </p>
                  </Link>
                ))}
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/communication" className="rounded-md border px-3 py-2 text-sm">
              Internal communication
            </Link>
            <a href={exportUrl} className="rounded-md border px-3 py-2 text-sm">
              Export filtered CSV
            </a>
            {session.user.role === "ADMIN" ? (
              <Link href="/dashboard/admin" className="rounded-md border px-3 py-2 text-sm">
                Go to admin dashboard
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function dedupeLatestSubmissionPerStudent<T extends { studentId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.studentId)) continue;
    seen.add(item.studentId);
    deduped.push(item);
  }
  return deduped;
}

function daysUntilDate(targetDate: Date, now: Date) {
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  return Math.round((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateAverageReviewHours(
  items: Array<{ status: SubmissionStatus; submittedAt: Date; updatedAt: Date }>,
) {
  const completed = items.filter((item) => ["ENROLLED", "REJECTED", "VISA_GRANTED"].includes(item.status));
  if (completed.length === 0) return 0;
  const totalHours = completed.reduce((sum, item) => {
    const diffMs = item.updatedAt.getTime() - item.submittedAt.getTime();
    return sum + Math.max(0, diffMs / (1000 * 60 * 60));
  }, 0);
  return Math.round(totalHours / completed.length);
}

function buildWeeklyTrendBuckets(
  items: Array<{ status: SubmissionStatus; submittedAt: Date; updatedAt: Date }>,
) {
  const labels = ["Wk-4", "Wk-3", "Wk-2", "Wk-1"];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekMs = 1000 * 60 * 60 * 24 * 7;

  return labels.map((label, index) => {
    const start = new Date(startOfToday.getTime() - weekMs * (4 - index));
    const end = new Date(start.getTime() + weekMs);
    const submitted = items.filter(
      (item) => item.submittedAt.getTime() >= start.getTime() && item.submittedAt.getTime() < end.getTime(),
    ).length;
    const resolved = items.filter(
      (item) =>
        item.updatedAt.getTime() >= start.getTime() &&
        item.updatedAt.getTime() < end.getTime() &&
        ["ENROLLED", "REJECTED", "VISA_GRANTED"].includes(item.status),
    ).length;
    return {
      label,
      submitted,
      resolved,
      pending: Math.max(0, submitted - resolved),
    };
  });
}

function CategoryCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{
    studentId: string;
    status: SubmissionStatus;
    student: {
      name: string | null;
      email: string;
      studentProfile: { visaExpiryDate: Date | null } | null;
    };
  }>;
  emptyLabel: string;
}) {
  return (
    <article className="rounded-md border border-gray-200 p-3">
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-600">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={`${item.studentId}-${item.status}`}>
              <Link
                href={`/dashboard/students/${item.studentId}`}
                className="block rounded-md border border-gray-200 px-2 py-1.5 text-xs transition hover:border-rose-300 hover:bg-rose-50/40"
              >
                <p className="font-semibold">{item.student.name ?? item.student.email}</p>
                <p className="text-gray-600">
                  {formatSubmissionStatus(item.status)}
                  {item.student.studentProfile?.visaExpiryDate
                    ? ` · Visa expiry ${item.student.studentProfile.visaExpiryDate.toLocaleDateString()}`
                    : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function RiskBucket({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{
    id: string;
    studentId: string;
    student: { name: string | null; email: string };
    status: SubmissionStatus;
  }>;
  emptyLabel: string;
}) {
  return (
    <section className="rounded-md border border-gray-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-600">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
          {items.slice(0, 12).map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/students/${item.studentId}`}
                className="block rounded-md border border-gray-200 px-2 py-1 text-xs transition hover:border-rose-300"
              >
                <p className="font-semibold">{item.student.name ?? item.student.email}</p>
                <p className="text-gray-600">{formatSubmissionStatus(item.status)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

function QueueFilterButton({
  label,
  queue,
  current,
  tab,
}: {
  label: string;
  queue: "all" | "unassigned" | "overdue" | "needs_approval";
  current: "all" | "unassigned" | "overdue" | "needs_approval";
  tab: string;
}) {
  const base = `/dashboard/sub-admin?tab=${tab}`;
  return (
    <Link
      href={queue === "all" ? base : `${base}&queue=${queue}`}
      className={`rounded-md border px-3 py-2 text-sm ${
        current === queue
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
      }`}
    >
      {label}
    </Link>
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
    include: {
      student: { include: { studentProfile: { select: { id: true } } } },
    },
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

  if (submission.student.studentProfile?.id) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: submission.student.studentProfile.id,
        entityType: "STUDENT",
        entityId: submission.studentId,
        action: `Updated questionnaire submission status to ${formatSubmissionStatus(status)}`,
        metadata: { submissionId, status },
      },
    });
  }

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/student");
  redirect("/dashboard/sub-admin");
}

async function bulkUpdateSubmissionStatusAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const status = String(formData.get("status") ?? "") as SubmissionStatus;
  const submissionIds = formData
    .getAll("submissionIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (!submissionStatuses.includes(status) || submissionIds.length === 0) {
    redirect("/dashboard/sub-admin");
  }

  const submissions = await prisma.questionnaireSubmission.findMany({
    where: { id: { in: submissionIds } },
    include: {
      student: { include: { studentProfile: { select: { id: true } } } },
    },
  });
  if (submissions.length === 0) redirect("/dashboard/sub-admin");

  const allowed = submissions.filter((submission) => {
    if (session.user.role === "ADMIN") return true;
    return submission.assignedToId === session.user.id || submission.assignedToId === null;
  });
  if (allowed.length === 0) redirect("/dashboard/sub-admin");

  for (const submission of allowed) {
    await prisma.questionnaireSubmission.update({
      where: { id: submission.id },
      data:
        session.user.role === "SUB_ADMIN" && submission.assignedToId === null
          ? { status, assignedToId: session.user.id }
          : { status },
    });

    if (submission.student.studentProfile?.id) {
      await prisma.activityLog.create({
        data: {
          actorId: session.user.id,
          targetStudentProfileId: submission.student.studentProfile.id,
          entityType: "STUDENT",
          entityId: submission.studentId,
          action: `Updated questionnaire submission status to ${formatSubmissionStatus(status)} (bulk)`,
          metadata: { submissionId: submission.id, status },
        },
      });
    }
  }

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/student");
  redirect("/dashboard/sub-admin");
}

async function delegateStudentToInternalStaffAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const internalStaffId = String(formData.get("internalStaffId") ?? "");
  if (!studentId || !internalStaffId) redirect("/dashboard/sub-admin");

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect("/dashboard/sub-admin");

  const staff = await prisma.user.findFirst({
    where: { id: internalStaffId, role: "INTERNAL_STAFF" },
    select: { id: true },
  });
  if (!staff) redirect("/dashboard/sub-admin");

  await prisma.studentAssignment.updateMany({
    where: { studentProfileId: studentProfile.id, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });
  await prisma.studentAssignment.create({
    data: {
      studentProfileId: studentProfile.id,
      assignedToId: internalStaffId,
      assignedById: session.user.id,
      isActive: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "ASSIGNMENT",
      entityId: studentProfile.id,
      action: "Assigned student to internal staff (from sub-admin dashboard)",
      metadata: { internalStaffId: staff.id },
    },
  });

  revalidatePath("/dashboard/sub-admin");
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/sub-admin");
}

async function claimSubmissionAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) redirect("/dashboard/sub-admin");

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, assignedToId: true, studentId: true },
  });
  if (!submission) redirect("/dashboard/sub-admin");

  if (session.user.role === "SUB_ADMIN" && submission.assignedToId && submission.assignedToId !== session.user.id) {
    redirect("/dashboard/sub-admin");
  }

  await prisma.questionnaireSubmission.update({
    where: { id: submission.id },
    data: {
      assignedToId: session.user.id,
      status: submission.assignedToId ? undefined : "UNDER_REVIEW",
    },
  });

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/students/${submission.studentId}`);
  redirect("/dashboard/sub-admin");
}

async function escalateSubmissionAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  const reason = String(formData.get("reason") ?? "Escalated by sub-admin").trim();
  if (!submissionId) redirect("/dashboard/sub-admin");

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        include: { studentProfile: { select: { id: true } } },
      },
    },
  });
  if (!submission || !submission.student.studentProfile) redirect("/dashboard/sub-admin");

  if (session.user.role === "SUB_ADMIN" && submission.assignedToId && submission.assignedToId !== session.user.id) {
    redirect("/dashboard/sub-admin");
  }

  const taskTitle = `Escalation: ${submission.student.name ?? submission.student.email}`;
  await prisma.task.create({
    data: {
      title: taskTitle,
      description: reason,
      priority: "URGENT",
      status: "TODO",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      studentProfileId: submission.student.studentProfile.id,
      assigneeId: submission.assignedToId ?? session.user.id,
      assignerId: session.user.id,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: submission.student.studentProfile.id,
      entityType: "TASK",
      entityId: submission.id,
      action: `Escalated case from sub-admin dashboard: ${reason}`,
    },
  });

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${submission.studentId}`);
  redirect("/dashboard/sub-admin");
}
