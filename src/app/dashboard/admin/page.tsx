import { hash } from "bcryptjs";
import type { SubmissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { AdminAnalyticsCharts } from "@/components/admin-analytics-charts";
import { CaseReferenceLabel } from "@/components/case-reference-label";
import { ContributionsTabSection } from "@/components/contributions-tab-panel";
import { DashboardTabBar } from "@/components/dashboard-tab-bar";
import { DelegationSuccessToast } from "@/components/delegation-success-toast";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { DeleteStaffButton } from "@/components/delete-staff-button";
import { NewInquiriesCard } from "@/components/new-inquiries-card";
import { RemindersWidget } from "@/components/reminders-widget";
import { getRemindersForUser } from "@/lib/reminders";
import { prisma } from "@/lib/prisma";
import { redirectWithDashboardNotice, redirectWithDelegationNotice } from "@/lib/redirect-after-delegation";
import { createWorkflowNotification } from "@/lib/workflow-notifications";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { formatSubmissionStatus } from "@/lib/submission";
import { formatVisaStatus, formatYearsLeft } from "@/lib/student-tracking";
import {
  allCaseStages,
  caseStageLabel,
  caseStageOrder,
  caseStageTerminals,
  caseStageTone,
} from "@/lib/case-stage";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  country?: string;
  course?: string;
  tab?: string;
}>;

export default async function AdminDashboardPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const tab = (searchParams.tab ?? "overview") as
    | "overview"
    | "students"
    | "analytics"
    | "staff"
    | "contributions";
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

  // Gate queries by tab to avoid loading data that isn't needed
  const isOverviewTab = tab === "overview";
  const isStudentsTab = tab === "students";
  const isAnalyticsTab = tab === "analytics";
  const isStaffTab = tab === "staff";
  const needsFilteredSubmissions = isOverviewTab || isStudentsTab || isAnalyticsTab;
  const needsInternalStaff = isOverviewTab || isStudentsTab || isStaffTab;
  const needsSubAdmins = isOverviewTab || isStudentsTab || isStaffTab;
  const needsRecentAssignments = isOverviewTab || isStaffTab;

  const nowForFreshInquiries = new Date();
  const oneDayAgoForFreshInquiries = new Date(
    nowForFreshInquiries.getTime() - 24 * 60 * 60 * 1000,
  );
  const sevenDaysAgoForFreshInquiries = new Date(
    nowForFreshInquiries.getTime() - 7 * 24 * 60 * 60 * 1000,
  );

  const [reminders, totalStudents, submissionsCount, activeSubAdmins, convertedCount, byCountry, byCourse,
    byIntake,
    recentSubmissions,
    filteredSubmissions,
    adminUsers,
    subAdmins,
    funnelCounts,
    homePosts,
    internalStaffUsers,
    staffTeamMemberships,
    recentAssignments,
    openTaskCount,
    stagePipelineCounts,
    newInquiries,
    newInquiriesLast24hCount,
  ] = await Promise.all([
    isOverviewTab ? getRemindersForUser("ADMIN", session.user.id) : Promise.resolve([]),
    prisma.user.count({ where: { role: "USER" } }),
    isOverviewTab ? prisma.questionnaireSubmission.count() : Promise.resolve(0),
    isOverviewTab ? prisma.user.count({ where: { role: "SUB_ADMIN" } }) : Promise.resolve(0),
    isOverviewTab ? prisma.questionnaireSubmission.count({
      where: { status: { in: ["OFFER_RECEIVED", "VISA_GRANTED", "ENROLLED"] } },
    }) : Promise.resolve(0),
    isAnalyticsTab ? prisma.questionnaireSubmission.groupBy({
      by: ["sourceCountry"],
      where: { sourceCountry: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { sourceCountry: "desc" } },
      take: 5,
    }) : Promise.resolve([]),
    isAnalyticsTab ? prisma.questionnaireSubmission.groupBy({
      by: ["intendedCourse"],
      where: { intendedCourse: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { intendedCourse: "desc" } },
      take: 5,
    }) : Promise.resolve([]),
    isAnalyticsTab ? prisma.questionnaireSubmission.groupBy({
      by: ["intendedIntake"],
      where: { intendedIntake: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { intendedIntake: "desc" } },
      take: 5,
    }) : Promise.resolve([]),
    isStudentsTab ? prisma.questionnaireSubmission.findMany({
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
    }) : Promise.resolve([]),
    needsFilteredSubmissions ? prisma.questionnaireSubmission.findMany({
      where: filteredWhere,
      include: {
        student: {
          include: {
            studentProfile: {
              include: {
                assignments: {
                  where: { isActive: true },
                  orderBy: { createdAt: "desc" },
                  select: {
                    assignedToId: true,
                    assignedTo: { select: { name: true, email: true } },
                  },
                },
              },
            },
          },
        },
        assignedSubAdmin: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }) : Promise.resolve([]),
    isStaffTab ? prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, email: true, jobTitle: true },
      orderBy: { createdAt: "asc" },
    }) : Promise.resolve([]),
    needsSubAdmins ? prisma.user.findMany({
      where: { role: "SUB_ADMIN" },
      select: { id: true, name: true, email: true, jobTitle: true },
      orderBy: { createdAt: "asc" },
    }) : Promise.resolve([]),
    isAnalyticsTab ? prisma.questionnaireSubmission.groupBy({
      by: ["status"],
      _count: { _all: true },
    }) : Promise.resolve([]),
    isStaffTab ? prisma.homePost.findMany({
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
    needsInternalStaff ? prisma.user.findMany({
      where: { role: "INTERNAL_STAFF" },
      select: { id: true, name: true, email: true, jobTitle: true },
      orderBy: { createdAt: "asc" },
    }) : Promise.resolve([]),
    isStaffTab ? prisma.staffTeamMembership.findMany({
      include: {
        manager: { select: { id: true, name: true, email: true } },
        internalStaff: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
    needsRecentAssignments ? prisma.studentAssignment.findMany({
      where: { isActive: true },
      include: {
        studentProfile: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
    isOverviewTab ? prisma.task.count({
      where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
    }) : Promise.resolve(0),
    isOverviewTab ? prisma.studentProfile.groupBy({
      by: ["caseStage"],
      _count: { _all: true },
    }) : Promise.resolve([]),
    isOverviewTab ? prisma.questionnaireSubmission.findMany({
      where: {
        assignedToId: null,
        submittedAt: { gte: sevenDaysAgoForFreshInquiries },
      },
      select: {
        id: true,
        submittedAt: true,
        sourceCity: true,
        sourceCountry: true,
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
    isOverviewTab ? prisma.questionnaireSubmission.count({
      where: {
        assignedToId: null,
        submittedAt: { gte: oneDayAgoForFreshInquiries },
      },
    }) : Promise.resolve(0),
  ]);

  const stageCountMap = new Map<string, number>(
    stagePipelineCounts.map((row) => [row.caseStage, row._count._all]),
  );
  const stageCounts = allCaseStages.map((stage) => ({
    stage,
    count: stageCountMap.get(stage) ?? 0,
  }));
  const stageTotal = stageCounts.reduce((sum, item) => sum + item.count, 0);

  const filteredStudentProfileIds = filteredSubmissions
    .map((item) => item.student.studentProfile?.id)
    .filter((id): id is string => Boolean(id));
  const [draftContractsCount, draftInvoicesCount, pendingDocumentsCount] = await Promise.all([
    needsFilteredSubmissions ? prisma.contract.count({
      where: { studentProfileId: { in: filteredStudentProfileIds }, status: "DRAFT" },
    }) : Promise.resolve(0),
    needsFilteredSubmissions ? prisma.invoice.count({
      where: { studentProfileId: { in: filteredStudentProfileIds }, status: "DRAFT" },
    }) : Promise.resolve(0),
    needsFilteredSubmissions ? prisma.studentDocument.count({
      where: { studentProfileId: { in: filteredStudentProfileIds }, verificationStatus: "PENDING" },
    }) : Promise.resolve(0),
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
  const latestSubmissionPerStudent = dedupeLatestSubmissionPerStudent(filteredSubmissions);
  const visaExpiringSoonItems = latestSubmissionPerStudent.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 90;
  });
  const autoFollowUpItems = latestSubmissionPerStudent.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    const nextFollowUpDate = item.student.studentProfile?.nextFollowUpDate;
    const visaDays = visaExpiryDate ? daysUntilDate(visaExpiryDate, today) : null;
    const followUpDays = nextFollowUpDate ? daysUntilDate(nextFollowUpDate, today) : null;
    const visaWindow = visaDays !== null && visaDays >= 120 && visaDays <= 150;
    const followUpWindow = followUpDays !== null && followUpDays >= 120 && followUpDays <= 150;
    return visaWindow || followUpWindow;
  });
  const pendingItems = latestSubmissionPerStudent.filter((item) =>
    ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"].includes(item.status),
  );
  const offerInProgressItems = latestSubmissionPerStudent.filter((item) =>
    ["OFFER_RECEIVED", "VISA_GRANTED"].includes(item.status),
  );
  const enrolledItems = latestSubmissionPerStudent.filter((item) => item.status === "ENROLLED");
  const rejectedItems = latestSubmissionPerStudent.filter((item) => item.status === "REJECTED");
  const visaExpiringSoon = filteredSubmissions.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 90;
  }).length;
  const hearFromCounts = new Map<string, number>();
  for (const submission of filteredSubmissions) {
    const source = extractHearFromAnswer(submission.answers);
    if (!source) continue;
    hearFromCounts.set(source, (hearFromCounts.get(source) ?? 0) + 1);
  }
  const hearFromItems = Array.from(hearFromCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const totalHearFromResponses = hearFromItems.reduce((sum, item) => sum + item.value, 0);
  const managerByInternalStaffId = new Map(
    staffTeamMemberships.map((membership) => [membership.internalStaffId, membership.manager]),
  );
  const assignmentCountByStaff = new Map<string, number>();
  for (const assignment of recentAssignments) {
    assignmentCountByStaff.set(
      assignment.assignedToId,
      (assignmentCountByStaff.get(assignment.assignedToId) ?? 0) + 1,
    );
  }
  const overloadedStaffCount = internalStaffUsers.filter(
    (staff) => (assignmentCountByStaff.get(staff.id) ?? 0) >= 3,
  ).length;
  const pendingApprovalsCount = draftContractsCount + draftInvoicesCount + pendingDocumentsCount;
  const unresolvedCaseCount = pendingItems.length + offerInProgressItems.length;
  const quickHealthScore =
    submissionsCount === 0
      ? 100
      : Math.max(
          0,
          100 - Math.round(((pendingApprovalsCount + visaExpiringSoon + unresolvedCaseCount) / submissionsCount) * 100),
        );
  const totalStudentsPreview = recentSubmissions
    .slice(0, 2)
    .map((submission) => getStudentDisplayName(submission.student, submission.answers));
  const submissionsPreview = recentSubmissions
    .slice(0, 2)
    .map((submission) => formatSubmissionStatus(submission.status));
  const activeSubAdminsPreview = subAdmins
    .slice(0, 2)
    .map((agent) => agent.name ?? agent.email);
  const internalStaffPreview = internalStaffUsers
    .slice(0, 2)
    .map((staff) => staff.name ?? staff.email);
  const openTasksPreview = recentAssignments
    .slice(0, 2)
    .map((assignment) => assignment.studentProfile.user.name ?? assignment.studentProfile.user.email);
  const visaExpiringPreview = visaExpiringSoonItems
    .slice(0, 2)
    .map((item) => getStudentDisplayName(item.student, item.answers));
  const pendingApprovalsPreview = pendingItems
    .slice(0, 2)
    .map((item) => getStudentDisplayName(item.student, item.answers));
  const draftContractsPreview = filteredSubmissions
    .filter((item) =>
      item.student.studentProfile ? filteredStudentProfileIds.includes(item.student.studentProfile.id) : false,
    )
    .slice(0, 2)
    .map((item) => getStudentDisplayName(item.student, item.answers));
  const draftInvoicesPreview = offerInProgressItems
    .slice(0, 2)
    .map((item) => getStudentDisplayName(item.student, item.answers));
  const pendingDocsPreview = pendingItems
    .slice(0, 2)
    .map((item) => getStudentDisplayName(item.student, item.answers));
  const overloadedStaffPreview = internalStaffUsers
    .filter((staff) => (assignmentCountByStaff.get(staff.id) ?? 0) >= 3)
    .slice(0, 2)
    .map((staff) => `${staff.name ?? staff.email} (${assignmentCountByStaff.get(staff.id) ?? 0} cases)`);

  return (
    <section className="space-y-6 text-gray-900">
      <div>
        <h1 className="text-2xl font-semibold">Admin Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Full system visibility for students, agents, applications, and regional
          interest trends.
        </p>
      </div>

      <DashboardTabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "students", label: "Students", count: totalStudents },
          { id: "analytics", label: "Analytics" },
          { id: "staff", label: "Staff & Content" },
          { id: "contributions", label: "Contributions" },
        ]}
        activeTab={tab}
      />

      <Suspense fallback={null}>
        <DelegationSuccessToast />
      </Suspense>

      {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {reminders.length > 0 && (
            <RemindersWidget reminders={reminders} title="Reminders" maxItems={8} />
          )}

          <NewInquiriesCard
            inquiries={newInquiries}
            last24hCount={newInquiriesLast24hCount}
            claimAction={claimSubmissionAction}
            viewAllHref="/dashboard/admin?tab=students"
          />

          <section className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Executive Snapshot</h2>
              <p className="text-xs text-gray-600">Core numbers at a glance</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <StatCard title="Total Students" value={String(totalStudents)} preview={totalStudentsPreview} />
              <StatCard title="Submissions" value={String(submissionsCount)} preview={submissionsPreview} />
              <StatCard title="Active Sub Admins" value={String(activeSubAdmins)} preview={activeSubAdminsPreview} />
              <StatCard title="Internal Staff" value={String(internalStaffUsers.length)} preview={internalStaffPreview} />
              <StatCard title="Offer Rate" value={offerRate} />
              <StatCard title="Open Tasks" value={String(openTaskCount)} preview={openTasksPreview} />
              <StatCard title="Visa Expiring <=90d" value={String(visaExpiringSoon)} preview={visaExpiringPreview} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard title="Pending Approvals" value={String(pendingApprovalsCount)} preview={pendingApprovalsPreview} />
            <StatCard title="Draft Contracts" value={String(draftContractsCount)} preview={draftContractsPreview} />
            <StatCard title="Draft Invoices" value={String(draftInvoicesCount)} preview={draftInvoicesPreview} />
            <StatCard title="Pending Docs" value={String(pendingDocumentsCount)} preview={pendingDocsPreview} />
            <StatCard title="Overloaded Staff" value={String(overloadedStaffCount)} preview={overloadedStaffPreview} />
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Case Stage Funnel</h2>
                <p className="mt-1 text-xs text-gray-600">
                  All students grouped by their current workflow stage ({stageTotal} total)
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Workflow stages</p>
                <ul className="mt-2 space-y-1.5">
                  {caseStageOrder.map((stage) => {
                    const item = stageCounts.find((c) => c.stage === stage);
                    const count = item?.count ?? 0;
                    const pct = stageTotal === 0 ? 0 : Math.round((count / stageTotal) * 100);
                    return (
                      <li key={stage} className="flex items-center gap-3">
                        <div className="w-52 shrink-0 text-xs font-medium text-gray-700">
                          {caseStageLabel(stage)}
                        </div>
                        <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-gray-100">
                          <div
                            className="h-full rounded-md bg-gradient-to-r from-rose-400 to-blue-500"
                            style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <div className="w-20 shrink-0 text-right text-xs font-semibold text-gray-700">
                          {count} ({pct}%)
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Outcomes / end states</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {caseStageTerminals.map((stage) => {
                    const item = stageCounts.find((c) => c.stage === stage);
                    const count = item?.count ?? 0;
                    const pct = stageTotal === 0 ? 0 : Math.round((count / stageTotal) * 100);
                    return (
                      <article
                        key={stage}
                        className={`rounded-md border p-3 ${caseStageTone(stage)}`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                          {caseStageLabel(stage)}
                        </p>
                        <p className="mt-1 text-xl font-semibold">{count}</p>
                        <p className="text-[11px] opacity-80">{pct}% of total</p>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Admin Command Center</h2>
                <p className="mt-1 text-xs text-gray-600">
                  Fast overview of operations health, approvals, and team capacity.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                System Health: {quickHealthScore}%
              </span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <article className="rounded-md border border-gray-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Approvals Queue</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>Contracts pending: {draftContractsCount}</li>
                  <li>Invoices pending: {draftInvoicesCount}</li>
                  <li>Documents pending: {pendingDocumentsCount}</li>
                </ul>
              </article>
              <article className="rounded-md border border-gray-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Case Pressure</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>Pending/under review: {pendingItems.length}</li>
                  <li>Offer/visa in progress: {offerInProgressItems.length}</li>
                  <li>Visa expiring soon: {visaExpiringSoonItems.length}</li>
                </ul>
              </article>
              <article className="rounded-md border border-gray-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team Capacity</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>Sub-admins active: {activeSubAdmins}</li>
                  <li>Internal staff active: {internalStaffUsers.length}</li>
                  <li>Staff overloaded: {overloadedStaffCount}</li>
                </ul>
              </article>
            </div>
          </section>
        </div>
      )}

      {/* ── STUDENTS TAB ───────────────────────────────────────── */}
      {tab === "students" && (
        <div className="space-y-6">
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
                  title="Auto Follow-up (Visa or follow-up in 4-5 months)"
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
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              <input
                name="search"
                defaultValue={search}
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="Search name, case ref, city, course"
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

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Filtered Submissions & Assignment</h2>
            <p className="mt-1 text-xs text-gray-600">
              Unified queue for assignment, delegation, and direct profile actions.
            </p>
            {filteredSubmissions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No submissions match current filters.</p>
            ) : (
              <div className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
                {filteredSubmissions.map((submission) => {
                  const activeInternalDelegations =
                    submission.student.studentProfile?.assignments ?? [];
                  const activeInternalDelegationIds = new Set(
                    activeInternalDelegations.map((assignment) => assignment.assignedToId),
                  );

                  return (
                  <article id={`submission-${submission.id}`} key={submission.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {getStudentDisplayName(submission.student, submission.answers)}
                          </p>
                          <CaseReferenceLabel
                            caseReference={submission.student.studentProfile?.caseReference}
                          />
                        </div>
                        <p className="text-xs text-gray-600">
                          {submission.sourceCity ?? "Unknown city"},{" "}
                          {submission.sourceCountry ?? "Unknown country"} |{" "}
                          {submission.intendedCourse ?? "No course"}
                        </p>
                        <p className="text-xs text-gray-600">
                          Status: {formatSubmissionStatus(submission.status)}
                        </p>
                        {submission.student.studentProfile ? (
                          <p className="mt-1">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${caseStageTone(submission.student.studentProfile.caseStage)}`}
                            >
                              Stage: {caseStageLabel(submission.student.studentProfile.caseStage)}
                            </span>
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-600">
                          Visa:{" "}
                          {submission.student.studentProfile
                            ? formatVisaStatus(submission.student.studentProfile.visaStatus)
                            : "Not set"}{" "}
                          | Years left: {formatYearsLeft(submission.student.studentProfile?.courseEndDate)}
                        </p>
                        <p className="text-xs text-gray-600">{getFollowUpLabel(submission.student.studentProfile?.visaExpiryDate, today)}</p>
                        {activeInternalDelegations.length > 0 ? (
                          <p className="text-xs text-gray-600">
                            Internal staff:{" "}
                            {activeInternalDelegations
                              .map((assignment) => assignment.assignedTo.name ?? assignment.assignedTo.email)
                              .join(", ")}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-600">Internal staff: Not assigned</p>
                        )}
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
                          <button type="submit" className="rounded-md bg-black px-3 py-1 text-sm text-white">
                            Save
                          </button>
                        </form>
                        {submission.student.studentProfile && internalStaffUsers.length > 0 ? (
                          <form action={delegateStudentFromAdminAction} className="min-w-64 rounded-md border border-gray-200 p-2">
                            <input type="hidden" name="studentId" value={submission.studentId} />
                            <input type="hidden" name="anchorId" value={`submission-${submission.id}`} />
                            <p className="mb-1 text-xs font-semibold text-gray-700">Delegate to staff</p>
                            <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                              {internalStaffUsers.map((staff) => (
                                <label key={staff.id} className="flex items-center gap-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    name="internalStaffIds"
                                    value={staff.id}
                                    defaultChecked={activeInternalDelegationIds.has(staff.id)}
                                    className="h-4 w-4"
                                  />
                                  <span>{staff.name ?? staff.email}</span>
                                </label>
                              ))}
                            </div>
                            <button type="submit" className="mt-2 rounded-md border px-3 py-1 text-sm">
                              Update delegation
                            </button>
                          </form>
                        ) : null}
                        <DeleteWithConfirm
                          formAction={deleteStudentFromAdminAction}
                          confirmMessage="Delete this student and all associated records? This cannot be undone."
                          buttonLabel="Delete student"
                          buttonClassName="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-700"
                        >
                          <input type="hidden" name="studentId" value={submission.studentId} />
                        </DeleteWithConfirm>
                      </div>
                    </div>
                  </article>
                  );
                })}
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
                  <li key={submission.id} className="flex flex-wrap items-center gap-2">
                    <CaseReferenceLabel
                      caseReference={submission.student.studentProfile?.caseReference}
                    />
                    <span>
                      {getStudentDisplayName(submission.student, submission.answers)} submitted from{" "}
                      {submission.sourceCountry ?? "Unknown"} ({formatSubmissionStatus(submission.status)})
                    </span>
                    {submission.student.studentProfile ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${caseStageTone(submission.student.studentProfile.caseStage)}`}
                      >
                        {caseStageLabel(submission.student.studentProfile.caseStage)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ── ANALYTICS TAB ──────────────────────────────────────── */}
      {tab === "analytics" && (
        <div className="space-y-6">
          <AdminAnalyticsCharts byCountry={countryChartData} byCourse={courseChartData} funnel={funnelItems} />

          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Lead Source Analytics (How did you hear from us?)</h2>
              <Link href="/dashboard/admin/lead-sources" className="rounded-md border px-3 py-1 text-xs">
                Open detailed view
              </Link>
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Based on current filtered enquiries. Total responses: {totalHearFromResponses}
            </p>
            {hearFromItems.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No source responses found.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {hearFromItems.map((item) => {
                  const percentage = totalHearFromResponses === 0 ? 0 : Math.round((item.value / totalHearFromResponses) * 100);
                  return (
                    <li key={item.label} className="rounded-md border border-gray-200 p-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <p className="font-medium">{item.label}</p>
                        <p className="text-gray-600">{item.value} ({percentage}%)</p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-blue-500" style={{ width: `${Math.max(percentage, 4)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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
        </div>
      )}

      {/* ── STAFF & CONTENT TAB ────────────────────────────────── */}
      {tab === "staff" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4">
            <Link href="/dashboard/admin/questionnaire" className="rounded-md border px-3 py-2 text-sm">
              Manage questionnaire template
            </Link>
            <Link href="/dashboard/admin/templates" className="rounded-md border px-3 py-2 text-sm">
              Manage email templates
            </Link>
            <Link href="/dashboard/admin/settings" className="rounded-md border px-3 py-2 text-sm">
              Company / Invoice settings
            </Link>
            <Link href="/dashboard/communication" className="rounded-md border px-3 py-2 text-sm">
              Internal communication
            </Link>
            <a href={exportUrl} className="rounded-md border px-3 py-2 text-sm">
              Export filtered CSV
            </a>
          </div>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Home Page Posts</h2>
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
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">Video post</div>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">Text post</div>
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

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Admin Accounts</h2>
            <p className="mt-1 text-xs text-gray-600">
              Create additional admin login accounts for secure operational backup and oversight.
            </p>
            <form action={createAdminAccountAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Admin full name"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="email"
                type="email"
                required
                placeholder="admin@example.com"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Password"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="jobTitle"
                placeholder="Job title (optional)"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">
                Create admin
              </button>
            </form>

            {adminUsers.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No admin accounts yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {adminUsers.map((adminUser) => (
                  <li key={adminUser.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-medium text-gray-900">
                          {adminUser.name ?? adminUser.email}
                          {adminUser.id === session.user.id ? (
                            <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              You
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-600">{adminUser.email}</p>
                        <p className="mt-0.5 text-sm text-gray-600">
                          Job title: {adminUser.jobTitle ?? "Not set"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <Link
                          href={`/dashboard/admin/admin/${adminUser.id}/edit`}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          Edit
                        </Link>
                        <form action={deleteAdminAccountAction} className="inline">
                          <input type="hidden" name="adminId" value={adminUser.id} />
                          <DeleteStaffButton
                            label="Delete"
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                          />
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Sub-Admin Accounts</h2>
            <p className="mt-1 text-xs text-gray-600">
              Create sub-admin login accounts. Each sub-admin gets their own dashboard and team assignment controls.
            </p>
            <form action={createSubAdminAccountAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Sub-admin full name"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="email"
                type="email"
                required
                placeholder="subadmin@example.com"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Password"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="jobTitle"
                placeholder="Job title (optional)"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">
                Create sub-admin
              </button>
            </form>

            {subAdmins.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No sub-admin accounts yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {subAdmins.map((subAdmin) => (
                  <li key={subAdmin.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-medium text-gray-900">
                          {subAdmin.name ?? subAdmin.email}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-600">{subAdmin.email}</p>
                        <p className="mt-0.5 text-sm text-gray-600">
                          Job title: {subAdmin.jobTitle ?? "Not set"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <Link
                          href={`/dashboard/admin/sub-admin/${subAdmin.id}/edit`}
                          className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          Edit
                        </Link>
                        <form action={deleteSubAdminAction} className="inline">
                          <input type="hidden" name="subAdminId" value={subAdmin.id} />
                          <DeleteStaffButton
                            label="Delete"
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                          />
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Internal Staff Accounts</h2>
            <p className="mt-1 text-xs text-gray-600">
              Create internal staff login accounts and assign each to a sub-admin team.
            </p>
            <form action={createInternalStaffAccountAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Staff full name"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="email"
                type="email"
                required
                placeholder="staff@example.com"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Password"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="jobTitle"
                placeholder="Job title (optional)"
                className="rounded-md border px-3 py-2 text-sm"
              />
              <select name="subAdminId" defaultValue="" className="rounded-md border px-3 py-2 text-sm">
                <option value="">Assign later</option>
                {subAdmins.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name ?? agent.email}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">
                Create internal staff
              </button>
            </form>

            {internalStaffUsers.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No internal staff accounts yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <ul className="min-w-[600px] space-y-3">
                  {internalStaffUsers.map((staff) => {
                    const manager = managerByInternalStaffId.get(staff.id);
                    return (
                      <li key={staff.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-medium text-gray-900">{staff.name ?? staff.email}</p>
                            <p className="mt-0.5 text-sm text-gray-600">{staff.email}</p>
                            <p className="mt-0.5 text-sm text-gray-600">
                              Job title: {staff.jobTitle ?? "Not set"}
                            </p>
                            <p className="mt-0.5 text-sm text-gray-600">
                              Manager: {manager ? manager.name ?? manager.email : "Unassigned"}
                            </p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                            <Link
                              href={`/dashboard/admin/staff/${staff.id}/edit`}
                              className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                            >
                              Edit
                            </Link>
                            <form action={deleteInternalStaffAction} className="inline">
                              <input type="hidden" name="internalStaffId" value={staff.id} />
                              <DeleteStaffButton
                                label="Delete"
                                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                              />
                            </form>
                            <form action={assignInternalStaffManagerAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="internalStaffId" value={staff.id} />
                              <select
                                name="subAdminId"
                                defaultValue={manager?.id ?? ""}
                                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                              >
                                <option value="">Unassigned</option>
                                {subAdmins.map((agent) => (
                                  <option key={agent.id} value={agent.id}>
                                    {agent.name ?? agent.email}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                                Save manager
                              </button>
                            </form>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Internal Delegation Snapshot</h2>
            <p className="mt-1 text-xs text-gray-600">Recent active assignments and workload hot spots.</p>
            {recentAssignments.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No active student-to-staff assignments yet.</p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {recentAssignments.map((assignment) => (
                  <li key={assignment.id} className="rounded-md border border-gray-200 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {assignment.studentProfile.user.name ?? assignment.studentProfile.user.email}
                        </p>
                        <p className="text-xs text-gray-600">
                          Assigned to {assignment.assignedTo.name ?? assignment.assignedTo.email}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          (assignmentCountByStaff.get(assignment.assignedToId) ?? 0) >= 3
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {(assignmentCountByStaff.get(assignment.assignedToId) ?? 0) >= 3 ? "HIGH LOAD" : "BALANCED"}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/students/${assignment.studentProfile.user.id}`}
                      className="mt-1 inline-block text-xs text-blue-600 underline"
                    >
                      Open student profile
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ── CONTRIBUTIONS TAB ──────────────────────────────────── */}
      {tab === "contributions" && <ContributionsTabSection />}
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
        studentProfile: { visaExpiryDate: Date | null; caseReference: string } | null;
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{getStudentDisplayName(item.student)}</p>
                  <CaseReferenceLabel caseReference={item.student.studentProfile?.caseReference} />
                </div>
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

function getStudentDisplayName(student: { name: string | null; email: string }, answers?: unknown) {
  const normalizedName = student.name?.trim();
  if (normalizedName && normalizedName.toLowerCase() !== "student user") return normalizedName;
  const fullNameFromAnswers = extractFullNameFromAnswers(answers);
  if (fullNameFromAnswers) return fullNameFromAnswers;
  return student.email;
}

function extractFullNameFromAnswers(answers?: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const raw = (answers as Record<string, unknown>).fullName;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractHearFromAnswer(answers?: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const raw = (answers as Record<string, unknown>).hearFrom;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function getFollowUpLabel(visaExpiryDate: Date | null | undefined, now: Date) {
  if (!visaExpiryDate) return "Auto Follow-up: Not enough visa data yet";
  const days = daysUntilDate(visaExpiryDate, now);
  if (days >= 120 && days <= 150) return "Auto Follow-up: Due now (4-5 months before visa expiry)";
  if (days > 150) return `Auto Follow-up: In ${days - 150} day(s)`;
  if (days >= 0) return "Auto Follow-up: Already in critical expiry window";
  return "Auto Follow-up: Visa already expired";
}

function StatCard({ title, value, preview }: { title: string; value: string; preview?: string[] }) {
  return (
    <article className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      {preview && preview.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {preview.map((line, idx) => (
            <li key={`${idx}-${line}`} className="truncate" title={line}>
              - {line}
            </li>
          ))}
        </ul>
      ) : null}
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

async function deleteStudentFromAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/dashboard/admin");

  await prisma.user.deleteMany({
    where: {
      id: studentId,
      role: "USER",
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  redirect("/dashboard/admin");
}

async function delegateStudentFromAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const anchorId = String(formData.get("anchorId") ?? "").trim();
  const selectedStaffIds = Array.from(
    new Set(
      [
        ...formData.getAll("internalStaffIds").map((value) => String(value)),
        String(formData.get("internalStaffId") ?? ""),
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  if (!studentId) redirect("/dashboard/admin");

  const staffMembers = await prisma.user.findMany({
    where: { id: { in: selectedStaffIds }, role: "INTERNAL_STAFF" },
    select: { id: true, name: true, email: true },
  });
  if (selectedStaffIds.length > 0 && staffMembers.length === 0) redirect("/dashboard/admin");

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!studentProfile) redirect("/dashboard/admin");

  const validStaffIds = new Set(staffMembers.map((staff) => staff.id));
  const now = new Date();
  const currentAssignments = await prisma.studentAssignment.findMany({
    where: { studentProfileId: studentProfile.id },
    select: { id: true, assignedToId: true, isActive: true },
  });
  const currentActiveIds = new Set(
    currentAssignments
      .filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.assignedToId),
  );
  const existingAssignmentsByStaffId = new Map(
    currentAssignments.map((assignment) => [assignment.assignedToId, assignment]),
  );

  await prisma.$transaction(async (tx) => {
    await tx.studentAssignment.updateMany({
      where: {
        studentProfileId: studentProfile.id,
        isActive: true,
        assignedToId: { notIn: Array.from(validStaffIds) },
      },
      data: { isActive: false, endedAt: now },
    });

    for (const staffId of validStaffIds) {
      const existing = existingAssignmentsByStaffId.get(staffId);
      if (existing) {
        await tx.studentAssignment.update({
          where: { id: existing.id },
          data: {
            assignedById: session.user.id,
            isActive: true,
            endedAt: null,
          },
        });
      } else {
        await tx.studentAssignment.create({
          data: {
            studentProfileId: studentProfile.id,
            assignedToId: staffId,
            assignedById: session.user.id,
            isActive: true,
          },
        });
      }
    }
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "ASSIGNMENT",
      entityId: studentProfile.id,
      action: "Updated internal staff delegation (from admin dashboard)",
      metadata: { internalStaffIds: Array.from(validStaffIds) },
    },
  });

  const actorLabel = session.user.name?.trim() || session.user.email || "An admin";
  const studentLabel = studentProfile.user.name?.trim() || studentProfile.user.email;
  const newlyAssignedStaff = staffMembers.filter((staff) => !currentActiveIds.has(staff.id));
  await Promise.all(
    newlyAssignedStaff.map((staff) =>
      createWorkflowNotification({
        recipientId: staff.id,
        actorId: session.user.id,
        studentProfileId: studentProfile.id,
        type: "STUDENT_DELEGATED",
        title: "Student delegated to you",
        message: `${studentLabel} has been assigned to you by ${actorLabel}.`,
        link: `/dashboard/students/${studentId}`,
        actionRequired: true,
        metadata: { delegatedFrom: "admin_dashboard" },
      }),
    ),
  );

  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");

  if (validStaffIds.size === 0) {
    await redirectWithDashboardNotice({
      dashboardPath: "/dashboard/admin",
      noticeParams: { statusUpdated: "1" },
      anchorId: anchorId || undefined,
    });
  } else {
    const staffLabel = staffMembers
      .map((staff) => staff.name?.trim() || staff.email)
      .filter(Boolean)
      .join(", ");
    await redirectWithDelegationNotice({
      dashboardPath: "/dashboard/admin",
      staffLabel: staffLabel || "staff",
      anchorId: anchorId || undefined,
    });
  }
}

async function createInternalStaffAccountAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const jobTitleRaw = String(formData.get("jobTitle") ?? "").trim();
  const jobTitle = jobTitleRaw.length > 0 ? jobTitleRaw : null;
  const subAdminId = String(formData.get("subAdminId") ?? "");

  if (name.length < 2 || !email.includes("@") || password.length < 8) {
    redirect("/dashboard/admin");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    redirect("/dashboard/admin");
  }

  const passwordHash = await hash(password, 12);
  const internalStaff = await prisma.user.create({
    data: {
      name,
      email,
      jobTitle,
      password: passwordHash,
      role: "INTERNAL_STAFF",
    },
    select: { id: true },
  });

  if (subAdminId) {
    const subAdmin = await prisma.user.findFirst({
      where: { id: subAdminId, role: "SUB_ADMIN" },
      select: { id: true },
    });
    if (subAdmin) {
      await prisma.staffTeamMembership.create({
        data: {
          managerId: subAdmin.id,
          internalStaffId: internalStaff.id,
        },
      });
    }
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin");
}

async function createSubAdminAccountAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const jobTitleRaw = String(formData.get("jobTitle") ?? "").trim();
  const jobTitle = jobTitleRaw.length > 0 ? jobTitleRaw : null;

  if (name.length < 2 || !email.includes("@") || password.length < 8) {
    redirect("/dashboard/admin?tab=staff");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    redirect("/dashboard/admin?tab=staff");
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      email,
      jobTitle,
      password: passwordHash,
      role: "SUB_ADMIN",
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

async function createAdminAccountAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const jobTitleRaw = String(formData.get("jobTitle") ?? "").trim();
  const jobTitle = jobTitleRaw.length > 0 ? jobTitleRaw : null;

  if (name.length < 2 || !email.includes("@") || password.length < 8) {
    redirect("/dashboard/admin?tab=staff");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    redirect("/dashboard/admin?tab=staff");
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      email,
      jobTitle,
      password: passwordHash,
      role: "ADMIN",
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

async function deleteAdminAccountAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const adminId = String(formData.get("adminId") ?? "");
  if (!adminId) redirect("/dashboard/admin?tab=staff");
  if (adminId === session.user.id) redirect("/dashboard/admin?tab=staff");

  const adminUser = await prisma.user.findFirst({
    where: { id: adminId, role: "ADMIN" },
    select: { id: true },
  });
  if (!adminUser) redirect("/dashboard/admin?tab=staff");

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount <= 1) {
    redirect("/dashboard/admin?tab=staff");
  }

  await prisma.user.delete({
    where: { id: adminId },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

async function deleteSubAdminAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const subAdminId = String(formData.get("subAdminId") ?? "");
  if (!subAdminId) redirect("/dashboard/admin?tab=staff");

  const subAdmin = await prisma.user.findFirst({
    where: { id: subAdminId, role: "SUB_ADMIN" },
    select: { id: true },
  });
  if (!subAdmin) redirect("/dashboard/admin?tab=staff");

  await prisma.user.delete({
    where: { id: subAdminId },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin?tab=staff");
}

async function deleteInternalStaffAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const internalStaffId = String(formData.get("internalStaffId") ?? "");
  if (!internalStaffId) redirect("/dashboard/admin");

  const staff = await prisma.user.findFirst({
    where: { id: internalStaffId, role: "INTERNAL_STAFF" },
    select: { id: true },
  });
  if (!staff) redirect("/dashboard/admin");

  await prisma.user.delete({
    where: { id: internalStaffId },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin");
}

async function claimSubmissionAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) redirect("/dashboard/admin");

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, assignedToId: true, studentId: true },
  });
  if (!submission) redirect("/dashboard/admin");

  await prisma.questionnaireSubmission.update({
    where: { id: submission.id },
    data: {
      assignedToId: session.user.id,
      status: submission.assignedToId ? undefined : "UNDER_REVIEW",
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath(`/dashboard/students/${submission.studentId}`);
  redirect("/dashboard/admin");
}

async function assignInternalStaffManagerAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const internalStaffId = String(formData.get("internalStaffId") ?? "");
  const subAdminId = String(formData.get("subAdminId") ?? "");
  if (!internalStaffId) redirect("/dashboard/admin");

  const internalStaff = await prisma.user.findFirst({
    where: { id: internalStaffId, role: "INTERNAL_STAFF" },
    select: { id: true },
  });
  if (!internalStaff) redirect("/dashboard/admin");

  await prisma.staffTeamMembership.deleteMany({
    where: { internalStaffId: internalStaff.id },
  });

  if (subAdminId) {
    const subAdmin = await prisma.user.findFirst({
      where: { id: subAdminId, role: "SUB_ADMIN" },
      select: { id: true },
    });
    if (subAdmin) {
      await prisma.staffTeamMembership.create({
        data: {
          managerId: subAdmin.id,
          internalStaffId: internalStaff.id,
        },
      });
    }
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/admin");
}
