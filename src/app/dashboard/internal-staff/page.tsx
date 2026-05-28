import Link from "next/link";
import type { DocumentVerificationStatus, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { ContributionLeaderboard } from "@/components/contribution-leaderboard";
import { DashboardTabBar } from "@/components/dashboard-tab-bar";
import { RemindersWidget } from "@/components/reminders-widget";
import { StudentClientIntakeForm } from "@/components/student-client-intake-form";
import { getContributions } from "@/lib/contributions";
import { queueDevEmail } from "@/lib/email-outbox";
import { prisma } from "@/lib/prisma";
import { getRemindersForUser } from "@/lib/reminders";
import { createWorkflowNotification } from "@/lib/workflow-notifications";
import {
  allCaseStages,
  caseStageLabel,
  caseStageOrder,
  caseStageTerminals,
  caseStageTone,
} from "@/lib/case-stage";

type SearchParams = Promise<{ filter?: string; tab?: string; manualError?: string; manualSuccess?: string }>;

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
    | "contributions";
  const filterRaw = String(searchParams.filter ?? "all");
  const filter: "all" | "overdue" | "today" =
    filterRaw === "overdue" || filterRaw === "today" ? filterRaw : "all";
  const manualStudentError =
    searchParams.manualError === "duplicate"
      ? "A student or staff account already exists with that email."
      : searchParams.manualError === "validation"
        ? "Please complete all required fields with valid details."
        : searchParams.manualError === "template"
          ? "No active questionnaire template is available for internal intake."
          : null;
  const manualStudentSuccess = searchParams.manualSuccess === "student" || searchParams.manualSuccess === "client";
  const manualStudentSuccessType = searchParams.manualSuccess === "client" ? "client" : "student";

  const isAdmin = session.user.role === "ADMIN";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Gate queries by tab — overview-only data shouldn't block queue/tasks/students views
  const isOverviewTab = tab === "overview";

  const [reminders, assignments, stagePipelineCounts, tasks, conversations, followUps, pendingDocuments] = await Promise.all([
    isOverviewTab ? getRemindersForUser(session.user.role as "ADMIN" | "INTERNAL_STAFF", session.user.id) : Promise.resolve([]),
    prisma.studentAssignment.findMany({
      where: isAdmin ? { isActive: true } : { isActive: true, assignedToId: session.user.id },
      include: {
        studentProfile: {
          include: {
            user: { select: { id: true, name: true, email: true } },
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
    }),
    // Pipeline counts only needed for the overview tab case stage funnel
    isOverviewTab ? prisma.studentProfile.groupBy({
      by: ["caseStage"],
      where: isAdmin
        ? undefined
        : { assignments: { some: { assignedToId: session.user.id, isActive: true } } },
      _count: { _all: true },
    }) : Promise.resolve([]),
    prisma.task.findMany({
      where: isAdmin ? undefined : { assigneeId: session.user.id },
      include: {
        studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
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
    prisma.studentDocument.findMany({
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
  const caseRows = assignments.map((assignment) => {
    return {
      assignment,
      stage: assignment.studentProfile.caseStage,
      openTaskCount: assignment.studentProfile.tasks.length,
      pendingDocCount: assignment.studentProfile.documents.length,
      latestContract: assignment.studentProfile.contracts[0],
      latestInvoice: assignment.studentProfile.invoices[0],
    };
  });
  const activeCasePreview = caseRows.slice(0, 2).map((row) => {
    const studentName = row.assignment.studentProfile.user.name ?? row.assignment.studentProfile.user.email;
    return `${studentName} - ${caseStageLabel(row.stage)}`;
  });
  const openTaskPreview = openTasks.slice(0, 2).map((task) => {
    const studentName = task.studentProfile.user.name ?? task.studentProfile.user.email;
    return `${task.title} - ${studentName}`;
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
        meta: `${task.priority} · ${task.status}`,
      })),
    ...followUps
      .filter((profile) => profile.nextFollowUpDate)
      .map((profile) => ({
        id: `followup-${profile.id}`,
        kind: "FOLLOW_UP" as const,
        title: "Student follow-up",
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

  return (
    <section className="space-y-6 text-gray-900">
      <div>
        <h1 className="text-2xl font-semibold">Internal Staff Dashboard</h1>
      </div>

      <DashboardTabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "queue", label: "Work Queue", count: filteredOpenTasks.length },
          { id: "tasks", label: "Tasks & Docs", count: tasks.length + filteredPendingDocuments.length },
          { id: "students", label: "Students", count: assignments.length },
          { id: "contributions", label: "Contributions" },
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
              <p className="text-xs text-gray-500">Counts of students currently at each stage</p>
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
                  <li key={task.id} className="rounded-md border border-gray-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-gray-600">
                          {task.studentProfile.user.name ?? task.studentProfile.user.email} · {task.priority}
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
                        Open Student
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
                        Open Student
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
                        Open Student
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
          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">My Tasks</h2>
            {tasks.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No tasks assigned.</p>
            ) : (
              <form action={bulkUpdateTasksAction} className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                  <select
                    name="status"
                    required
                    defaultValue="DONE"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="DONE">Mark selected as DONE</option>
                    <option value="IN_PROGRESS">Mark selected as IN_PROGRESS</option>
                    <option value="BLOCKED">Mark selected as BLOCKED</option>
                    <option value="TODO">Mark selected as TODO</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800"
                  >
                    Apply to Selected Tasks
                  </button>
                </div>
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {tasks.map((task) => (
                    <li key={task.id} className="rounded-md border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" name="taskIds" value={task.id} className="mt-1 h-4 w-4" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{task.title}</p>
                              <p className="text-xs text-gray-600">
                                {task.priority} · {task.studentProfile.user.name ?? task.studentProfile.user.email}
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
                            <Link
                              href={`/dashboard/students/${task.studentProfile.user.id}`}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                            >
                              Open Student
                            </Link>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </form>
            )}
          </section>

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
                          Open Student
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
              description="Choose whether you are adding a student or client, then assign it to yourself."
            />
          ) : null}

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Assigned Students</h2>
            {assignments.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No delegated students yet.</p>
            ) : (
              <ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {caseRows.map((row) => (
                  <li key={row.assignment.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {row.assignment.studentProfile.user.name ?? row.assignment.studentProfile.user.email}
                        </p>
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
                        Open Student Profile
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
                      <p className="font-medium">{conversation.title ?? "Student thread"}</p>
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

      {/* ── CONTRIBUTIONS TAB ──────────────────────────────────── */}
      {tab === "contributions" && (
        <Suspense fallback={<ContributionsTabSkeleton />}>
          <InternalStaffContributionsTabPanel />
        </Suspense>
      )}
    </section>
  );
}

function ContributionsTabSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-lg border bg-gray-100" />
      ))}
    </div>
  );
}

async function InternalStaffContributionsTabPanel() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const cases =
    session.user.role === "ADMIN"
      ? await prisma.studentProfile.findMany({
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { updatedAt: "desc" },
          take: 20,
        })
      : await prisma.studentAssignment.findMany({
          where: { isActive: true, assignedToId: session.user.id },
          include: {
            studentProfile: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }).then((rows) => rows.map((row) => row.studentProfile));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Case-wise Contributions</h2>
        <p className="mt-1 text-xs text-gray-600">
          Contribution is shown separately for each student case.
        </p>
      </section>
      {cases.length === 0 ? (
        <section className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-600">No student cases available yet.</p>
        </section>
      ) : (
        await Promise.all(
          cases.map(async (studentProfile) => {
            const data = await getContributions({ studentProfileId: studentProfile.id });
            return (
              <section key={studentProfile.id} className="space-y-3">
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {studentProfile.user.name ?? studentProfile.user.email}
                      </p>
                      <p className="text-xs text-slate-600">
                        Case contribution breakdown
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/students/${studentProfile.user.id}?tab=contributions`}
                      className="rounded-md border px-3 py-1 text-xs text-slate-700"
                    >
                      Open profile
                    </Link>
                  </div>
                </div>
                <ContributionLeaderboard
                  data={data}
                  title="Who contributed to this case"
                  subtitle="Stages 70% · Documents 15% · Tasks 15% for this student only."
                />
              </section>
            );
          }),
        )
      )}
    </div>
  );
}

async function createManualStudentAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "INTERNAL_STAFF") redirect("/dashboard/internal-staff?tab=students");

  const recordType = formData.get("recordType") === "client" ? "client" : "student";
  const isClient = recordType === "client";
  const recordLabel = isClient ? "client" : "student";
  const recordTitle = isClient ? "Client" : "Student";
  const sourceLabel = isClient ? "Internal staff client" : "Internal staff";
  const courseFieldLabel = isClient ? "Service required" : "Course";
  const intakeFieldLabel = isClient ? "Visa type" : "Intake";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const course = String(formData.get("course") ?? "").trim();
  const intake = String(formData.get("intake") ?? "").trim();
  const currentEducation = String(formData.get("currentEducation") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const actor = await prisma.user.findFirst({
    where: {
      role: "INTERNAL_STAFF",
      OR: [{ id: session.user.id }, ...(session.user.email ? [{ email: session.user.email }] : [])],
    },
    select: { id: true, email: true, name: true },
  });

  if (!actor) redirect("/login");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    name.length < 2 ||
    name.length > 100 ||
    !emailRegex.test(email) ||
    !phone ||
    !country ||
    !city ||
    !course ||
    !intake ||
    !currentEducation
  ) {
    redirect("/dashboard/internal-staff?tab=students&manualError=validation");
  }

  const [existingUser, template] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.questionnaireTemplate.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }),
  ]);

  if (existingUser) redirect("/dashboard/internal-staff?tab=students&manualError=duplicate");
  if (!template) redirect("/dashboard/internal-staff?tab=students&manualError=template");

  const answers = {
    fullName: name,
    email,
    phone,
    country,
    city,
    currentEducationLevel: currentEducation,
    targetCourse: course,
    preferredIntake: intake,
    additionalNote: notes,
    recordType,
    source: sourceLabel,
  };

  const created = await prisma.$transaction(async (tx) => {
    const studentUser = await tx.user.create({
      data: {
        name,
        email,
        role: "USER",
      },
      select: { id: true, email: true, name: true },
    });

    const studentProfile = await tx.studentProfile.create({
      data: {
        userId: studentUser.id,
        phone,
        city,
        nationality: country,
        currentEducationLevel: currentEducation,
        targetCourse: course,
        preferredIntake: intake,
        followUpNotes: notes || null,
      },
      select: { id: true },
    });

    const submission = await tx.questionnaireSubmission.create({
      data: {
        studentId: studentUser.id,
        templateId: template.id,
        assignedToId: null,
        sourceCity: city,
        sourceCountry: country,
        intendedCourse: course,
        intendedIntake: intake,
        answers,
      },
      select: { id: true },
    });

    await tx.studentAssignment.create({
      data: {
        studentProfileId: studentProfile.id,
        assignedToId: actor.id,
        assignedById: actor.id,
        notes: notes || "Created by internal staff",
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
        action: `Created ${recordLabel} through internal staff intake`,
        metadata: {
          recordType,
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
        title: `${recordTitle} added by internal staff`,
        message: `${created.studentName} was added as a ${recordLabel} by ${creatorLabel}.`,
        note: notes || null,
        link: `/dashboard/sub-admin?tab=students#submission-${created.submissionId}`,
        actionRequired: true,
        metadata: {
          recordType,
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
      subject: `Your ${recordLabel} profile has been created - L&B Global`,
      htmlBody: `
        <p>Dear ${escapeHtml(created.studentName)},</p>
        <p>Your ${escapeHtml(recordLabel)} profile has been created by ${escapeHtml(creatorLabel)} at L&amp;B Global.</p>
        <p>Our team will contact you with the next steps for your ${isClient ? "visa service" : "course and visa process"}.</p>
        <p>Best regards,<br />L&amp;B Global</p>
      `,
      templateKey: "internal-staff-student-created",
    }),
    ...recipients.map((recipient) =>
      queueDevEmail({
        createdById: actor.id,
        toEmail: recipient.email,
        subject: `${recordTitle} added by internal staff: ${created.studentName}`,
        htmlBody: `
          <p>${escapeHtml(creatorLabel)} added a new ${escapeHtml(recordLabel)} through internal intake.</p>
          <ul>
            <li><strong>Name:</strong> ${escapeHtml(created.studentName)}</li>
            <li><strong>Email:</strong> ${escapeHtml(created.studentEmail)}</li>
            <li><strong>${escapeHtml(courseFieldLabel)}:</strong> ${escapeHtml(course)}</li>
            <li><strong>${escapeHtml(intakeFieldLabel)}:</strong> ${escapeHtml(intake)}</li>
          </ul>
          <p>The ${escapeHtml(recordLabel)} has been assigned to ${escapeHtml(creatorLabel)}.</p>
        `,
        templateKey: "internal-staff-student-created-notice",
      }),
    ),
  ]);

  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/students/${created.studentUserId}`);
  redirect(`/dashboard/internal-staff?tab=students&manualSuccess=${recordType}`);
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

function taskStatusTone(status: string) {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  if (status === "BLOCKED") return "bg-rose-50 text-rose-700";
  return "bg-gray-100 text-gray-700";
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

  const isAdmin = session.user.role === "ADMIN";
  const canEditAsTaskOwner = session.user.id === task.assigneeId || session.user.id === task.assignerId;
  const canEditAsAssignedInternalStaff = task.studentProfile.assignments.some(
    (assignment) => assignment.assignedToId === session.user.id,
  );

  if (!isAdmin && !canEditAsTaskOwner && !canEditAsAssignedInternalStaff) {
    redirect("/dashboard/internal-staff");
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status },
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

  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${task.studentProfile.userId}`);
  redirect("/dashboard/internal-staff");
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
  redirect("/dashboard/internal-staff");
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

  const isAdmin = session.user.role === "ADMIN";
  const allowedTasks = tasks.filter((task) => {
    if (isAdmin) return true;
    if (task.assigneeId === session.user.id || task.assignerId === session.user.id) return true;
    return task.studentProfile.assignments.some((assignment) => assignment.assignedToId === session.user.id);
  });
  if (allowedTasks.length === 0) redirect("/dashboard/internal-staff");

  const allowedTaskIds = allowedTasks.map((task) => task.id);
  await prisma.task.updateMany({
    where: { id: { in: allowedTaskIds } },
    data: { status },
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
  for (const userId of userIds) {
    revalidatePath(`/dashboard/students/${userId}`);
  }
  revalidatePath("/dashboard/internal-staff");
  redirect("/dashboard/internal-staff");
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
