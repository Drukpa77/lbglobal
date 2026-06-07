import Link from "next/link";
import type { DocumentVerificationStatus, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CaseReferenceLabel } from "@/components/case-reference-label";
import { ContributionsTabSection } from "@/components/contributions-tab-panel";
import { DeletedClientsTab } from "@/components/deleted-clients-tab";
import { DashboardProfileHeader } from "@/components/dashboard-profile-header";
import { DashboardTabBar } from "@/components/dashboard-tab-bar";
import { LocationFilterButtons } from "@/components/location-filter-buttons";
import {
  restoreDeletedClientAction,
  permanentDeleteDeletedClientAction,
} from "@/app/dashboard/deleted-client-actions";
import { deletedClientUserWhere, listDeletedClients } from "@/lib/deleted-clients";
import { blobOpensThroughAuthenticatedApi } from "@/lib/blob-access";
import { RemindersWidget } from "@/components/reminders-widget";
import { StaffDashboardTasks } from "@/components/staff-dashboard-tasks";
import { StudentClientIntakeForm } from "@/components/student-client-intake-form";
import { VisaOutcomesPanel } from "@/components/visa-outcomes-panel";
import { queueDevEmail } from "@/lib/email-outbox";
import { generateNextCaseReference } from "@/lib/case-reference";
import { startNewVisaCaseForProfile } from "@/lib/visa-cases";
import {
  buildManualIntakeAnswers,
  buildManualIntakeProfileData,
  parseManualClientIntakeFormData,
} from "@/lib/manual-client-intake";
import {
  revalidateContributionsCache,
  revalidateContributionsCacheForCases,
} from "@/lib/contributions-cache";
import { prisma } from "@/lib/prisma";
import { getRemindersForUser } from "@/lib/reminders";
import {
  countryMatchesInquiryLocation,
  normalizeInquiryLocationFilter,
} from "@/lib/submission-filters";
import {
  executeTaskReassignment,
  listTaskAssigneeOptions,
  taskDashboardWhereForStaff,
  userCanManageTask,
} from "@/lib/task-assignment";
import { taskStatusCardClass, taskStatusTone } from "@/lib/task-status-styles";
import { createWorkflowNotification } from "@/lib/workflow-notifications";
import {
  allCaseStages,
  caseStageLabel,
  caseStageOrder,
  caseStageTerminals,
  caseStageTone,
} from "@/lib/case-stage";

type SearchParams = Promise<{ filter?: string; tab?: string; inquiryLocation?: string; manualError?: string; manualSuccess?: string }>;

export default async function InternalStaffDashboardPage(props: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "INTERNAL_STAFF" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  const searchParams = await props.searchParams;
  const tab = (searchParams.tab ?? "overview") as
    | "overview"
    | "queue"
    | "tasks"
    | "students"
    | "visa-outcomes"
    | "contributions"
    | "deleted-clients";
  const isDeletedClientsTab = tab === "deleted-clients";
  const filterRaw = String(searchParams.filter ?? "all");
  const filter: "all" | "overdue" | "today" =
    filterRaw === "overdue" || filterRaw === "today" ? filterRaw : "all";
  const inquiryLocation = normalizeInquiryLocationFilter(searchParams.inquiryLocation);
  const manualStudentError =
    searchParams.manualError === "duplicate"
      ? "A non-client account already exists with that email."
      : searchParams.manualError === "validation"
        ? "Please complete all required fields with valid details."
        : searchParams.manualError === "template"
          ? "No active questionnaire template is available for internal intake."
          : null;
  const manualStudentSuccess = searchParams.manualSuccess === "client";
  const manualStudentSuccessType = "client" as const;

  const isAdmin = session.user.role === "ADMIN";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Gate queries by tab — overview-only data shouldn't block queue/tasks/students views
  const isOverviewTab = tab === "overview";
  const isQueueTab = tab === "queue";
  const isTasksTab = tab === "tasks";
  const needsAssignments = true;
  const needsTasks = isOverviewTab || isQueueTab || isTasksTab;
  const needsPendingDocs = isOverviewTab || isQueueTab;

  const [reminders, assignments, stagePipelineCounts, tasks, taskAssigneeOptions, conversations, followUps, pendingDocuments, deletedClientsCount, deletedClients, visaOutcomes] = await Promise.all([
    isOverviewTab ? getRemindersForUser(session.user.role as "ADMIN" | "INTERNAL_STAFF", session.user.id) : Promise.resolve([]),
    needsAssignments ? prisma.studentAssignment.findMany({
      where: isAdmin
        ? { isActive: true, studentProfile: { user: { deletedAt: null } } }
        : {
            isActive: true,
            assignedToId: session.user.id,
            studentProfile: { user: { deletedAt: null } },
          },
      include: {
        studentProfile: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                submissions: {
                  select: { sourceCountry: true },
                  orderBy: { submittedAt: "desc" },
                  take: 1,
                },
              },
            },
            assignments: { where: { isActive: true }, select: { assignedToId: true }, take: 1 },
            tasks: {
              where: { status: { not: "DONE" } },
              select: { id: true },
            },
            documents: {
              where: { verificationStatus: "PENDING" },
              select: { id: true },
            },
            contracts: {
              select: { id: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            invoices: {
              select: { id: true, status: true, dueDate: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        assignedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }) : Promise.resolve([]),
    // Pipeline counts only needed for the overview tab case stage funnel
    isOverviewTab ? prisma.studentProfile.groupBy({
      by: ["caseStage"],
      where: isAdmin
        ? undefined
        : { assignments: { some: { assignedToId: session.user.id, isActive: true } } },
      _count: { _all: true },
    }) : Promise.resolve([]),
    needsTasks ? prisma.task.findMany({
      where: taskDashboardWhereForStaff(session.user.id, isAdmin),
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }) : Promise.resolve([]),
    needsTasks ? listTaskAssigneeOptions() : Promise.resolve([]),
    // conversations only rendered in the overview tab
    isOverviewTab ? prisma.conversation.findMany({
      where: isAdmin ? { type: "STUDENT_THREAD" } : { participants: { some: { userId: session.user.id } } },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }) : Promise.resolve([]),
    prisma.studentProfile.findMany({
      where: isAdmin
        ? { nextFollowUpDate: { not: null } }
        : {
            nextFollowUpDate: { not: null },
            assignments: { some: { assignedToId: session.user.id, isActive: true } },
          },
      select: {
        id: true,
        user: { select: { id: true, name: true, email: true } },
        visaStatus: true,
        nextFollowUpDate: true,
      },
      orderBy: { nextFollowUpDate: "asc" },
      take: 25,
    }),
    needsPendingDocs ? prisma.studentDocument.findMany({
      where: isAdmin
        ? { verificationStatus: "PENDING" }
        : {
            verificationStatus: "PENDING",
            studentProfile: {
              assignments: { some: { assignedToId: session.user.id, isActive: true } },
            },
          },
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
        studentProfile: {
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }) : Promise.resolve([]),
    prisma.user.count({ where: deletedClientUserWhere }),
    isDeletedClientsTab ? listDeletedClients() : Promise.resolve([]),
    prisma.visaCase.findMany({
          where: {
            status: { not: "ACTIVE" },
            caseStage: { in: caseStageTerminals },
            studentProfile: {
              user: { deletedAt: null },
              ...(isAdmin ? {} : { assignments: { some: { assignedToId: session.user.id, isActive: true } } }),
            },
          },
          include: {
            studentProfile: {
              select: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
          orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
          take: 100,
        }),
  ]);

  const openTasks = tasks.filter((task) => task.status !== "DONE");
  const overdueTasks = tasks.filter((task) => task.dueDate && task.dueDate < startOfToday && task.status !== "DONE");
  const dueTodayTasks = tasks.filter((task) => {
    if (!task.dueDate || task.status === "DONE") return false;
    const due = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());
    return due.getTime() === startOfToday.getTime();
  });
  const overdueFollowUps = followUps.filter(
    (profile) => profile.nextFollowUpDate && profile.nextFollowUpDate < startOfToday,
  );
  const allCaseRows = assignments.map((assignment) => {
    return {
      assignment,
      sourceCountry: assignment.studentProfile.user.submissions[0]?.sourceCountry ?? null,
      stage: assignment.studentProfile.caseStage,
      openTaskCount: assignment.studentProfile.tasks.length,
      pendingDocCount: assignment.studentProfile.documents.length,
      latestContract: assignment.studentProfile.contracts[0],
      latestInvoice: assignment.studentProfile.invoices[0],
    };
  });
  const caseRows = allCaseRows.filter(
    (row) =>
      countryMatchesInquiryLocation(row.sourceCountry, inquiryLocation) &&
      !caseStageTerminals.includes(row.stage),
  );
  const activeCasePreview = caseRows.slice(0, 2).map((row) => {
    const studentName = row.assignment.studentProfile.user.name ?? row.assignment.studentProfile.user.email;
    return `${studentName} - ${caseStageLabel(row.stage)}`;
  });
  const openTaskPreview = openTasks.slice(0, 2).map((task) => {
    const studentName = task.studentProfile.user.name ?? task.studentProfile.user.email;
    const owner = task.assignee.name ?? task.assignee.email;
    return `${task.title} (${owner}) - ${studentName}`;
  });
  const overdueTaskPreview = overdueTasks.slice(0, 1).map((task) => {
    const studentName = task.studentProfile.user.name ?? task.studentProfile.user.email;
    return `${task.title} - ${studentName}`;
  });
  const overdueFollowUpPreview = overdueFollowUps.slice(0, 1).map((profile) => {
    const studentName = profile.user.name ?? profile.user.email;
    return `Follow-up overdue - ${studentName}`;
  });
  const overduePreview = [...overdueTaskPreview, ...overdueFollowUpPreview].slice(0, 2);
  const pendingDocPreview = pendingDocuments.slice(0, 2).map((doc) => {
    const studentName = doc.studentProfile.user.name ?? doc.studentProfile.user.email;
    return `${doc.title} - ${studentName}`;
  });
  const stageCountMap = new Map<string, number>(
    stagePipelineCounts.map((row) => [row.caseStage, row._count._all]),
  );
  const stageCounts = allCaseStages.map((stage) => ({
    stage,
    count: stageCountMap.get(stage) ?? 0,
  }));
  const filteredOpenTasks = filterOpenTasks(openTasks, filter, startOfToday);
  const filteredFollowUps = filterFollowUps(followUps, filter, startOfToday);
  const filteredPendingDocuments = filterPendingDocuments(pendingDocuments);
  const availableFilterCount = {
    all: {
      tasks: openTasks.length,
      followUps: followUps.length,
      docs: pendingDocuments.length,
    },
    overdue: {
      tasks: overdueTasks.length,
      followUps: overdueFollowUps.length,
      docs: pendingDocuments.length,
    },
    today: {
      tasks: dueTodayTasks.length,
      followUps: followUps.filter((profile) => {
        if (!profile.nextFollowUpDate) return false;
        const due = new Date(
          profile.nextFollowUpDate.getFullYear(),
          profile.nextFollowUpDate.getMonth(),
          profile.nextFollowUpDate.getDate(),
        );
        return due.getTime() === startOfToday.getTime();
      }).length,
      docs: pendingDocuments.length,
    },
  };
  const upcomingDeadlines = [
    ...tasks
      .filter((task) => task.dueDate && task.status !== "DONE")
      .map((task) => ({
        id: `task-${task.id}`,
        kind: "TASK" as const,
        title: task.title,
        date: task.dueDate as Date,
        studentName: task.studentProfile.user.name ?? task.studentProfile.user.email,
        studentUserId: task.studentProfile.user.id,
        meta: `${task.priority} · ${task.status} · ${task.assignee.name ?? task.assignee.email}`,
      })),
    ...followUps
      .filter((profile) => profile.nextFollowUpDate)
      .map((profile) => ({
        id: `followup-${profile.id}`,
        kind: "FOLLOW_UP" as const,
        title: "Client follow-up",
        date: profile.nextFollowUpDate as Date,
        studentName: profile.user.name ?? profile.user.email,
        studentUserId: profile.user.id,
        meta: `Visa: ${profile.visaStatus}`,
      })),
    ...caseRows
      .filter((row) => row.latestInvoice?.dueDate)
      .map((row) => ({
        id: `invoice-${row.latestInvoice?.id}`,
        kind: "INVOICE_DUE" as const,
        title: "Invoice due date",
        date: row.latestInvoice?.dueDate as Date,
        studentName: row.assignment.studentProfile.user.name ?? row.assignment.studentProfile.user.email,
        studentUserId: row.assignment.studentProfile.user.id,
        meta: `Latest invoice: ${row.latestInvoice?.status}`,
      })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 25);
  const staffCaseListHrefBase = `/dashboard/internal-staff?tab=students&filter=${encodeURIComponent(filter)}`;

  return (
    <section className="space-y-6 text-gray-900">
      <DashboardProfileHeader
        name={session.user.name}
        email={session.user.email ?? ""}
        roleLabel={isAdmin ? "Administrator" : "Case manager"}
      />

      <DashboardTabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "queue", label: "Work Queue", count: filteredOpenTasks.length },
          { id: "tasks", label: "Tasks & Docs", count: tasks.length + filteredPendingDocuments.length },
          { id: "students", label: "Cases", count: caseRows.length },
          { id: "visa-outcomes", label: "Visa Outcomes", count: visaOutcomes.length },
          { id: "contributions", label: "Contributions" },
          { id: "deleted-clients", label: "Deleted Clients", count: deletedClientsCount },
        ]}
        activeTab={tab}
      />

      {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {reminders.length > 0 && (
            <RemindersWidget reminders={reminders} title="Reminders" maxItems={8} />
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Active Cases" value={assignments.length} tone="neutral" preview={activeCasePreview} />
            <MetricCard title="Open Tasks" value={openTasks.length} tone="blue" preview={openTaskPreview} />
            <MetricCard
              title="Overdue Items"
              value={overdueTasks.length + overdueFollowUps.length}
              tone="amber"
              preview={overduePreview}
            />
            <MetricCard title="Docs Pending Review" value={pendingDocuments.length} tone="rose" preview={pendingDocPreview} />
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Daily Work Report</h2>
                <p className="mt-1 text-xs text-gray-600">Download a CSV summary for handovers and tracking.</p>
              </div>
              <Link
                href={`/api/internal-staff/report?filter=${filter}`}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800"
              >
                Download Report CSV
              </Link>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Case Stage Pipeline</h2>
              <p className="text-xs text-gray-500">Counts of clients currently at each stage</p>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Workflow stages</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {caseStageOrder.map((stage) => {
                  const item = stageCounts.find((c) => c.stage === stage);
                  const count = item?.count ?? 0;
                  return (
                    <article
                      key={stage}
                      className={`min-w-[180px] rounded-md border p-3 ${caseStageTone(stage)}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {caseStageLabel(stage)}
                      </p>
                      <p className="mt-1 text-xl font-semibold">{count}</p>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Outcomes / end states</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {caseStageTerminals.map((stage) => {
                  const item = stageCounts.find((c) => c.stage === stage);
                  const count = item?.count ?? 0;
                  return (
                    <article
                      key={stage}
                      className={`min-w-[180px] rounded-md border p-3 ${caseStageTone(stage)}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {caseStageLabel(stage)}
                      </p>
                      <p className="mt-1 text-xl font-semibold">{count}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

        </div>
      )}

      {/* ── WORK QUEUE TAB ─────────────────────────────────────── */}
      {tab === "queue" && (
        <div className="space-y-6">
          <section className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Saved Filters</h2>
              <p className="text-xs text-gray-500">Apply to queue and follow-ups</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <FilterButton
                label="All Work"
                href="/dashboard/internal-staff?tab=queue"
                isActive={filter === "all"}
                detail={`${availableFilterCount.all.tasks} tasks · ${availableFilterCount.all.followUps} follow-ups`}
              />
              <FilterButton
                label="Overdue Focus"
                href="/dashboard/internal-staff?tab=queue&filter=overdue"
                isActive={filter === "overdue"}
                detail={`${availableFilterCount.overdue.tasks} tasks · ${availableFilterCount.overdue.followUps} follow-ups`}
              />
              <FilterButton
                label="Due Today"
                href="/dashboard/internal-staff?tab=queue&filter=today"
                isActive={filter === "today"}
                detail={`${availableFilterCount.today.tasks} tasks · ${availableFilterCount.today.followUps} follow-ups`}
              />
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Today&apos;s Priority Queue</h2>
              <p className="text-xs text-gray-500">{filteredOpenTasks.length} tasks in current filter</p>
            </div>
            {filteredOpenTasks.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No open tasks. Great work.</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredOpenTasks.slice(0, 20).map((task) => (
                  <li key={task.id} className={`rounded-md border p-3 ${taskStatusCardClass(task.status)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-gray-600">
                          {task.studentProfile.user.name ?? task.studentProfile.user.email} · {task.priority}
                        </p>
                        <p className="text-xs text-gray-600">
                          Assigned to: {task.assignee.name ?? task.assignee.email}
                        </p>
                        <p className="mt-1 text-xs text-gray-700">
                          Due: {task.dueDate ? task.dueDate.toLocaleDateString() : "No due date"}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${taskStatusTone(task.status)}`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <form action={updateTaskStatusFromDashboardAction} className="flex items-center gap-2">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="returnTab" value="queue" />
                        <select
                          name="status"
                          defaultValue={task.status}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="BLOCKED">BLOCKED</option>
                          <option value="DONE">DONE</option>
                        </select>
                        <button type="submit" className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium">
                          Update
                        </button>
                      </form>
                      <Link
                        href={`/dashboard/students/${task.studentProfile.user.id}`}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        Open Client
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Upcoming Follow-ups</h2>
                <p className="text-xs text-gray-500">{filteredFollowUps.length} scheduled</p>
              </div>
              {filteredFollowUps.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">No follow-up dates set yet.</p>
              ) : (
                <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredFollowUps.map((profile) => (
                    <li key={profile.id} className="rounded-md border border-gray-200 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{profile.user.name ?? profile.user.email}</p>
                          <p className="text-xs text-gray-600">
                            Follow-up: {profile.nextFollowUpDate?.toLocaleDateString()} · Visa: {profile.visaStatus}
                          </p>
                        </div>
                        {profile.nextFollowUpDate && profile.nextFollowUpDate < startOfToday ? (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                            OVERDUE
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                            ON TRACK
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/dashboard/students/${profile.user.id}`}
                        className="mt-2 inline-block rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        Open Client
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Deadline Calendar (Next items)</h2>
                <p className="text-xs text-gray-500">{upcomingDeadlines.length} upcoming</p>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">No upcoming deadlines yet.</p>
              ) : (
                <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {upcomingDeadlines.map((item) => (
                    <li key={item.id} className="rounded-md border border-gray-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-gray-600">{item.studentName}</p>
                          <p className="text-xs text-gray-700">{item.meta}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-700">{deadlineKindLabel(item.kind)}</p>
                          <p className="text-xs text-gray-600">{item.date.toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/students/${item.studentUserId}`}
                        className="mt-2 inline-block rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        Open Client
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </div>
      )}

      {/* ── TASKS & DOCS TAB ───────────────────────────────────── */}
      {tab === "tasks" && (
        <div className="space-y-6">
          <StaffDashboardTasks
            tasks={tasks}
            assigneeOptions={taskAssigneeOptions}
            bulkUpdateTasksAction={bulkUpdateTasksAction}
            reassignTaskAction={reassignTaskFromInternalStaffDashboardAction}
            updateTaskStatusAction={updateTaskStatusFromDashboardAction}
            returnTab="tasks"
          />

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Documents Pending Verification</h2>
              <p className="text-xs text-gray-500">{filteredPendingDocuments.length} pending</p>
            </div>
            {filteredPendingDocuments.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No pending documents right now.</p>
            ) : (
              <form action={bulkVerifyDocumentsAction} className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                  <select
                    name="status"
                    required
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                    defaultValue="VERIFIED"
                  >
                    <option value="VERIFIED">Approve selected</option>
                    <option value="REJECTED">Reject selected</option>
                  </select>
                  <input
                    name="notes"
                    placeholder="Shared notes for selected docs (optional)"
                    className="min-w-56 rounded-md border border-gray-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800"
                  >
                    Apply to Selected Documents
                  </button>
                </div>
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredPendingDocuments.map((doc) => (
                    <li key={doc.id} className="rounded-md border border-gray-200 p-2">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" name="documentIds" value={doc.id} className="mt-1 h-4 w-4" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="text-xs text-gray-600">
                            {doc.category} · Uploaded {doc.createdAt.toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-700">
                            {doc.studentProfile.user.name ?? doc.studentProfile.user.email}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        <Link
                          href={`/dashboard/students/${doc.studentProfile.user.id}`}
                          className="inline-block rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                        >
                          Open Client
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </form>
            )}
          </section>
        </div>
      )}

      {/* ── STUDENTS TAB ───────────────────────────────────────── */}
      {tab === "students" && (
        <div className="space-y-6">
          {session.user.role === "INTERNAL_STAFF" ? (
            <StudentClientIntakeForm
              action={createManualStudentAction}
              error={manualStudentError}
              success={manualStudentSuccess}
              successType={manualStudentSuccessType}
              description="Add a new client, choose their visa service, and assign the case to yourself."
            />
          ) : null}

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Your cases</h2>
                <LocationFilterButtons
                  active={inquiryLocation}
                  hrefBase={staffCaseListHrefBase}
                />
              </div>
              <p className="text-xs text-gray-600">{caseRows.length} results</p>
            </div>
            {caseRows.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No delegated clients match this filter.</p>
            ) : (
              <ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {caseRows.map((row) => (
                  <li key={row.assignment.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">
                            {row.assignment.studentProfile.user.name ??
                              row.assignment.studentProfile.user.email}
                          </p>
                          <CaseReferenceLabel caseReference={row.assignment.studentProfile.caseReference} />
                        </div>
                        <p className="text-xs text-gray-600">
                          Assigned by {row.assignment.assignedBy.name ?? row.assignment.assignedBy.email}
                        </p>
                        {row.assignment.notes ? <p className="mt-1 text-xs text-gray-600">{row.assignment.notes}</p> : null}
                        <p className="mt-1 text-xs text-gray-700">
                          Stage: {caseStageLabel(row.stage)} · Open tasks: {row.openTaskCount} · Pending docs: {row.pendingDocCount}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${caseStageTone(row.stage)}`}>
                        {caseStageLabel(row.stage)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/students/${row.assignment.studentProfile.user.id}`}
                        className="inline-block rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        Open Client Profile
                      </Link>
                      {row.latestInvoice?.status ? (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-700">
                          Invoice: {row.latestInvoice.status}
                        </span>
                      ) : null}
                      {row.latestContract?.status ? (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-700">
                          Contract: {row.latestContract.status}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Communication Threads</h2>
              <Link
                href="/dashboard/communication"
                className="rounded-md bg-gradient-to-r from-rose-500 to-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Open Chat / Create Thread
              </Link>
            </div>
            <p className="mt-1 text-xs text-gray-500">Chat with colleagues or create new team threads.</p>
            {conversations.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No threads yet. Click &quot;Open Chat / Create Thread&quot; above to start a conversation.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/dashboard/communication/${conversation.id}`}
                      className="block rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:border-rose-300"
                    >
                      <p className="font-medium">{conversation.title ?? "Client thread"}</p>
                      <p className="text-xs text-gray-600">
                        Updated {conversation.updatedAt.toLocaleString()}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "visa-outcomes" && <VisaOutcomesPanel outcomes={visaOutcomes} />}

      {/* ── CONTRIBUTIONS TAB ──────────────────────────────────── */}
      {tab === "deleted-clients" && (
        <DeletedClientsTab
          clients={deletedClients}
          isAdmin={isAdmin}
          returnPath="/dashboard/internal-staff?tab=deleted-clients"
          restoreDeletedClientAction={restoreDeletedClientAction}
          permanentDeleteDeletedClientAction={permanentDeleteDeletedClientAction}
          blobOpensThroughAuthenticatedApi={blobOpensThroughAuthenticatedApi()}
        />
      )}

      {tab === "contributions" && <ContributionsTabSection />}
    </section>
  );
}

async function createManualStudentAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "INTERNAL_STAFF") redirect("/dashboard/internal-staff?tab=students");

  const intake = parseManualClientIntakeFormData(formData);
  if (!intake) {
    redirect("/dashboard/internal-staff?tab=students&manualError=validation");
  }

  const actor = await prisma.user.findFirst({
    where: {
      role: "INTERNAL_STAFF",
      OR: [{ id: session.user.id }, ...(session.user.email ? [{ email: session.user.email }] : [])],
    },
    select: { id: true, email: true, name: true },
  });

  if (!actor) redirect("/login");

  const [existingUser, template] = await Promise.all([
    prisma.user.findUnique({
      where: { email: intake.email },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        studentProfile: { select: { id: true } },
      },
    }),
    prisma.questionnaireTemplate.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }),
  ]);

  if (existingUser && (existingUser.role !== "USER" || !existingUser.studentProfile)) {
    redirect("/dashboard/internal-staff?tab=students&manualError=duplicate");
  }
  if (!template) redirect("/dashboard/internal-staff?tab=students&manualError=template");

  const answers = buildManualIntakeAnswers(intake, { source: "Internal staff" });

  const created = await prisma.$transaction(async (tx) => {
    if (existingUser?.studentProfile) {
      await tx.user.update({
        where: { id: existingUser.id },
        data: { name: intake.name },
      });

      const newCase = await startNewVisaCaseForProfile(tx, {
        studentProfileId: existingUser.studentProfile.id,
        visaServiceType: intake.visaServiceType,
        otherServiceDescription: intake.otherServiceDescription,
        notes: intake.notes || "Started from internal staff intake for existing client",
      });

      const submission = await tx.questionnaireSubmission.create({
        data: {
          studentId: existingUser.id,
          templateId: template.id,
          assignedToId: null,
          sourceCity: intake.city,
          sourceCountry: intake.country,
          intendedCourse: intake.isStudentVisa ? intake.course : null,
          intendedIntake: intake.isStudentVisa ? intake.intake : null,
          answers,
        },
        select: { id: true },
      });

      await tx.studentAssignment.upsert({
        where: {
          studentProfileId_assignedToId: {
            studentProfileId: existingUser.studentProfile.id,
            assignedToId: actor.id,
          },
        },
        update: {
          assignedById: actor.id,
          notes: intake.notes || "New case started by internal staff",
          isActive: true,
          endedAt: null,
        },
        create: {
          studentProfileId: existingUser.studentProfile.id,
          assignedToId: actor.id,
          assignedById: actor.id,
          notes: intake.notes || "New case started by internal staff",
          isActive: true,
        },
      });

      await tx.activityLog.create({
        data: {
          actorId: actor.id,
          targetUserId: existingUser.id,
          targetStudentProfileId: existingUser.studentProfile.id,
          entityType: "STUDENT",
          entityId: existingUser.id,
          action: `Started new case ${newCase.caseReference} through internal staff intake`,
          metadata: {
            visaServiceType: intake.visaServiceType,
            source: "internal_staff_repeat",
            submissionId: submission.id,
            assignedToId: actor.id,
            caseReference: newCase.caseReference,
          },
        },
      });

      return {
        studentUserId: existingUser.id,
        studentProfileId: existingUser.studentProfile.id,
        submissionId: submission.id,
        studentEmail: existingUser.email,
        studentName: intake.name || existingUser.name || existingUser.email,
      };
    }

    const studentUser = await tx.user.create({
      data: {
        name: intake.name,
        email: intake.email,
        role: "USER",
      },
      select: { id: true, email: true, name: true },
    });

    const studentProfile = await tx.studentProfile.create({
      data: {
        caseReference: await generateNextCaseReference(tx),
        userId: studentUser.id,
        ...buildManualIntakeProfileData(intake),
      },
      select: { id: true },
    });

    const submission = await tx.questionnaireSubmission.create({
      data: {
        studentId: studentUser.id,
        templateId: template.id,
        assignedToId: null,
        sourceCity: intake.city,
        sourceCountry: intake.country,
        intendedCourse: intake.isStudentVisa ? intake.course : null,
        intendedIntake: intake.isStudentVisa ? intake.intake : null,
        answers,
      },
      select: { id: true },
    });

    await tx.studentAssignment.create({
      data: {
        studentProfileId: studentProfile.id,
        assignedToId: actor.id,
        assignedById: actor.id,
        notes: intake.notes || "Created by internal staff",
        isActive: true,
      },
    });

    await tx.activityLog.create({
      data: {
        actorId: actor.id,
        targetUserId: studentUser.id,
        targetStudentProfileId: studentProfile.id,
        entityType: "STUDENT",
        entityId: studentUser.id,
        action: "Created client through internal staff intake",
        metadata: {
          visaServiceType: intake.visaServiceType,
          source: "internal_staff",
          submissionId: submission.id,
          assignedToId: actor.id,
        },
      },
    });

    return {
      studentUserId: studentUser.id,
      studentProfileId: studentProfile.id,
      submissionId: submission.id,
      studentEmail: studentUser.email,
      studentName: studentUser.name ?? studentUser.email,
    };
  });

  const creatorLabel = actor.name ?? actor.email ?? "Internal staff";
  const managers = await prisma.staffTeamMembership.findMany({
    where: { internalStaffId: actor.id },
    select: {
      manager: { select: { id: true, email: true } },
    },
  });
  const fallbackRecipients =
    managers.length > 0
      ? []
      : await prisma.user.findMany({
          where: { role: { in: ["SUB_ADMIN", "ADMIN"] } },
          select: { id: true, email: true },
        });
  const recipients = managers.length > 0 ? managers.map((item) => item.manager) : fallbackRecipients;

  await Promise.all(
    recipients.map((recipient) =>
      createWorkflowNotification({
        recipientId: recipient.id,
        actorId: actor.id,
        studentProfileId: created.studentProfileId,
        type: "NEW_STUDENT_APPLICATION",
        title: "Client added by internal staff",
        message: `${created.studentName} (${intake.visaServiceLabel}) was added by ${creatorLabel}.`,
        note: intake.notes || null,
        link: `/dashboard/sub-admin?tab=students#submission-${created.submissionId}`,
        actionRequired: true,
        sendEmail: false,
        metadata: {
          visaServiceType: intake.visaServiceType,
          source: "internal_staff",
          submissionId: created.submissionId,
          internalStaffId: actor.id,
        },
      }),
    ),
  );

  await Promise.all([
    queueDevEmail({
      createdById: actor.id,
      toEmail: created.studentEmail,
      subject: "Your client profile has been created - L&B Global",
      htmlBody: `
        <p>Dear ${escapeHtml(created.studentName)},</p>
        <p>Your client profile has been created by ${escapeHtml(creatorLabel)} at L&amp;B Global.</p>
        <p>Our team will contact you with the next steps for your ${escapeHtml(intake.visaServiceLabel)} enquiry.</p>
        <p>Best regards,<br />L&amp;B Global</p>
      `,
      templateKey: "internal-staff-student-created",
    }),
    ...recipients.map((recipient) =>
      queueDevEmail({
        createdById: actor.id,
        toEmail: recipient.email,
        subject: `Client added by internal staff: ${created.studentName}`,
        htmlBody: `
          <p>${escapeHtml(creatorLabel)} added a new client through internal intake.</p>
          <ul>
            <li><strong>Name:</strong> ${escapeHtml(created.studentName)}</li>
            <li><strong>Email:</strong> ${escapeHtml(created.studentEmail)}</li>
            <li><strong>Service:</strong> ${escapeHtml(intake.visaServiceLabel)}</li>
            ${intake.isStudentVisa ? `<li><strong>Target course:</strong> ${escapeHtml(intake.course)}</li><li><strong>Preferred intake:</strong> ${escapeHtml(intake.intake)}</li>` : ""}
          </ul>
          <p>The client has been assigned to ${escapeHtml(creatorLabel)}.</p>
        `,
        templateKey: "internal-staff-student-created-notice",
      }),
    ),
  ]);

  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/students/${created.studentUserId}`);
  redirect("/dashboard/internal-staff?tab=students&manualSuccess=client");
}

function MetricCard({
  title,
  value,
  tone,
  preview,
}: {
  title: string;
  value: number;
  tone: "neutral" | "blue" | "amber" | "rose";
  preview?: string[];
}) {
  const toneClasses =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-gray-200 bg-white text-gray-900";
  return (
    <article className={`rounded-lg border p-4 ${toneClasses}`}>
      <p className="text-xs font-medium uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {preview && preview.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs opacity-80">
          {preview.map((line, idx) => (
            <li key={`${idx}-${line}`} className="truncate" title={line}>
              - {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs opacity-70">No items yet</p>
      )}
    </article>
  );
}

function deadlineKindLabel(kind: "TASK" | "FOLLOW_UP" | "INVOICE_DUE") {
  if (kind === "FOLLOW_UP") return "FOLLOW-UP";
  if (kind === "INVOICE_DUE") return "INVOICE";
  return "TASK";
}

function filterOpenTasks<
  T extends {
    dueDate: Date | null;
    status: string;
  },
>(tasks: T[], filter: "all" | "overdue" | "today", startOfToday: Date) {
  if (filter === "overdue") {
    return tasks.filter((task) => task.dueDate && task.dueDate < startOfToday && task.status !== "DONE");
  }
  if (filter === "today") {
    return tasks.filter((task) => {
      if (!task.dueDate || task.status === "DONE") return false;
      const due = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());
      return due.getTime() === startOfToday.getTime();
    });
  }
  return tasks;
}

function filterFollowUps<
  T extends {
    nextFollowUpDate: Date | null;
  },
>(profiles: T[], filter: "all" | "overdue" | "today", startOfToday: Date) {
  if (filter === "overdue") {
    return profiles.filter((profile) => profile.nextFollowUpDate && profile.nextFollowUpDate < startOfToday);
  }
  if (filter === "today") {
    return profiles.filter((profile) => {
      if (!profile.nextFollowUpDate) return false;
      const due = new Date(
        profile.nextFollowUpDate.getFullYear(),
        profile.nextFollowUpDate.getMonth(),
        profile.nextFollowUpDate.getDate(),
      );
      return due.getTime() === startOfToday.getTime();
    });
  }
  return profiles;
}

function filterPendingDocuments<T>(docs: T[]) {
  return docs;
}

async function updateTaskStatusFromDashboardAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const statusRaw = String(formData.get("status") ?? "TODO") as TaskStatus;
  const status: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(statusRaw)
    ? statusRaw
    : "TODO";
  if (!taskId) redirect("/dashboard/internal-staff");

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
        },
      },
    },
  });
  if (!task) redirect("/dashboard/internal-staff");

  if (
    !userCanManageTask(
      { id: session.user.id, role: session.user.role },
      {
        assigneeId: task.assigneeId,
        assignerId: task.assignerId,
        studentProfile: task.studentProfile,
      },
    )
  ) {
    redirect("/dashboard/internal-staff");
  }

  await prisma.task.update({
    where: { id: task.id },
    data:
      status === "DONE"
        ? { status, completedById: session.user.id, completedAt: new Date() }
        : { status, completedById: null, completedAt: null },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: task.id,
      action: `Updated task status from internal dashboard to ${status}`,
    },
  });

  revalidateContributionsCache(task.studentProfile.userId);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath(`/dashboard/students/${task.studentProfile.userId}`);
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  redirect(`/dashboard/internal-staff?tab=${returnTab}`);
}

async function reassignTaskFromInternalStaffDashboardAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }

  const taskId = String(formData.get("taskId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  if (!taskId || !assigneeId) redirect(`/dashboard/internal-staff?tab=${returnTab}`);

  const result = await executeTaskReassignment({
    taskId,
    newAssigneeId: assigneeId,
    actor: { id: session.user.id, role: session.user.role },
  });

  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  if (result.ok) {
    revalidatePath(`/dashboard/students/${result.studentUserId}`);
  }
  redirect(`/dashboard/internal-staff?tab=${returnTab}${result.ok && result.changed ? "&taskReassigned=1" : ""}`);
}

async function bulkVerifyDocumentsAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }

  const documentIds = formData
    .getAll("documentIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const statusRaw = String(formData.get("status") ?? "PENDING") as DocumentVerificationStatus;
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const status: DocumentVerificationStatus = ["VERIFIED", "REJECTED"].includes(statusRaw) ? statusRaw : "PENDING";
  if (documentIds.length === 0 || status === "PENDING") redirect("/dashboard/internal-staff");

  const documents = await prisma.studentDocument.findMany({
    where: { id: { in: documentIds } },
    include: {
      studentProfile: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
        },
      },
    },
  });
  if (documents.length === 0) redirect("/dashboard/internal-staff");

  const isAdmin = session.user.role === "ADMIN";
  const allowedDocuments = documents.filter(
    (document) =>
      isAdmin || document.studentProfile.assignments.some((assignment) => assignment.assignedToId === session.user.id),
  );
  if (allowedDocuments.length === 0) redirect("/dashboard/internal-staff");

  const notes = notesRaw.length > 0 ? notesRaw : null;
  const now = new Date();
  for (const document of allowedDocuments) {
    await prisma.studentDocument.update({
      where: { id: document.id },
      data: {
        verificationStatus: status,
        notes,
        verifiedById: status === "VERIFIED" ? session.user.id : document.verifiedById,
        verifiedAt: status === "VERIFIED" ? now : document.verifiedAt,
        returnResolvedAt:
          document.returnedAt && document.returnResolvedAt === null ? now : document.returnResolvedAt,
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
        note: notes,
        link: `/dashboard/students/${document.studentProfile.user.id}?tab=tasks`,
        actionRequired: true,
      });
    }
  }
  await prisma.activityLog.createMany({
    data: allowedDocuments.map((document) => ({
      actorId: session.user.id,
      targetStudentProfileId: document.studentProfileId,
      entityType: "DOCUMENT",
      entityId: document.id,
      action: `Set document verification status to ${status} from internal dashboard (bulk)`,
      metadata: notes ? { notes } : undefined,
    })),
  });

  const studentUserIds = Array.from(new Set(allowedDocuments.map((document) => document.studentProfile.userId)));
  for (const userId of studentUserIds) {
    revalidatePath(`/dashboard/students/${userId}`);
  }

  revalidatePath("/dashboard/internal-staff");
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  redirect(`/dashboard/internal-staff?tab=${returnTab}`);
}

async function bulkUpdateTasksAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }

  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const statusRaw = String(formData.get("status") ?? "TODO") as TaskStatus;
  const status: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(statusRaw) ? statusRaw : "TODO";
  if (taskIds.length === 0) redirect("/dashboard/internal-staff");

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      studentProfile: {
        select: {
          userId: true,
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
        },
      },
    },
  });
  if (tasks.length === 0) redirect("/dashboard/internal-staff");

  const allowedTasks = tasks.filter((task) =>
    userCanManageTask(
      { id: session.user.id, role: session.user.role },
      {
        assigneeId: task.assigneeId,
        assignerId: task.assignerId,
        studentProfile: task.studentProfile,
      },
    ),
  );
  if (allowedTasks.length === 0) redirect("/dashboard/internal-staff");

  const allowedTaskIds = allowedTasks.map((task) => task.id);
  await prisma.task.updateMany({
    where: { id: { in: allowedTaskIds } },
    data:
      status === "DONE"
        ? { status, completedById: session.user.id, completedAt: new Date() }
        : { status, completedById: null, completedAt: null },
  });
  await prisma.activityLog.createMany({
    data: allowedTasks.map((task) => ({
      actorId: session.user.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: task.id,
      action: `Updated task status from internal dashboard to ${status} (bulk)`,
    })),
  });

  const userIds = Array.from(new Set(allowedTasks.map((task) => task.studentProfile.userId)));
  revalidateContributionsCacheForCases(userIds);
  for (const userId of userIds) {
    revalidatePath(`/dashboard/students/${userId}`);
  }
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  redirect(`/dashboard/internal-staff?tab=${returnTab}`);
}

function FilterButton({
  label,
  href,
  detail,
  isActive,
}: {
  label: string;
  href: string;
  detail: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
        isActive ? "border-black bg-black text-white" : "border-gray-300 bg-white text-gray-900 hover:border-gray-400"
      }`}
    >
      <p className="font-medium">{label}</p>
      <p className={`text-xs ${isActive ? "text-gray-200" : "text-gray-600"}`}>{detail}</p>
    </Link>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
