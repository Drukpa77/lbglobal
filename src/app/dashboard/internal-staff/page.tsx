import Link from "next/link";
import type { DocumentVerificationStatus, TaskPriority, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardTabBar } from "@/components/dashboard-tab-bar";
import { InternalStaffHelp } from "@/components/internal-staff-help";
import { RemindersWidget } from "@/components/reminders-widget";
import { prisma } from "@/lib/prisma";
import { getRemindersForUser } from "@/lib/reminders";

type SearchParams = Promise<{ filter?: string; tab?: string }>;

export default async function InternalStaffDashboardPage(props: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "INTERNAL_STAFF" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  const searchParams = await props.searchParams;
  const tab = (searchParams.tab ?? "overview") as "overview" | "queue" | "tasks" | "students";
  const filterRaw = String(searchParams.filter ?? "all");
  const filter: "all" | "overdue" | "today" =
    filterRaw === "overdue" || filterRaw === "today" ? filterRaw : "all";

  const isAdmin = session.user.role === "ADMIN";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [reminders, assignments, tasks, conversations, followUps, pendingDocuments] = await Promise.all([
    getRemindersForUser(session.user.role as "ADMIN" | "INTERNAL_STAFF", session.user.id),
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
    prisma.task.findMany({
      where: isAdmin ? undefined : { assigneeId: session.user.id },
      include: {
        studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.conversation.findMany({
      where: isAdmin ? { type: "STUDENT_THREAD" } : { participants: { some: { userId: session.user.id } } },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
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
    const stage = getCaseStage(assignment.studentProfile);
    return {
      assignment,
      stage,
      openTaskCount: assignment.studentProfile.tasks.length,
      pendingDocCount: assignment.studentProfile.documents.length,
      latestContract: assignment.studentProfile.contracts[0],
      latestInvoice: assignment.studentProfile.invoices[0],
    };
  });
  const stageCounts = stageOrder.map((stage) => ({
    stage,
    count: caseRows.filter((row) => row.stage === stage).length,
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
        <p className="mt-1 text-sm text-gray-600">
          Manage your case queue, deadlines, documents, and communication from one place.
        </p>
      </div>

      <InternalStaffHelp />

      <DashboardTabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "queue", label: "Work Queue", count: filteredOpenTasks.length },
          { id: "tasks", label: "Tasks & Docs", count: tasks.length + filteredPendingDocuments.length },
          { id: "students", label: "Students", count: assignments.length },
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
            <MetricCard title="Active Cases" value={assignments.length} tone="neutral" />
            <MetricCard title="Open Tasks" value={openTasks.length} tone="blue" />
            <MetricCard title="Overdue Items" value={overdueTasks.length + overdueFollowUps.length} tone="amber" />
            <MetricCard title="Docs Pending Review" value={pendingDocuments.length} tone="rose" />
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
              <p className="text-xs text-gray-500">Auto-derived from current case activity</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {stageCounts.map((item) => (
                <article key={item.stage} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{stageLabel(item.stage)}</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">{item.count}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">SOP Task Templates</h2>
              <p className="text-xs text-gray-500">Generate standard checklists for consistency</p>
            </div>
            {assignments.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No active cases available for SOP task generation.</p>
            ) : (
              <form action={createSopTasksAction} className="mt-3 grid gap-2 md:grid-cols-4">
                <select name="studentProfileId" required className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                  <option value="">Select student case</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.studentProfile.id} value={assignment.studentProfile.id}>
                      {assignment.studentProfile.user.name ?? assignment.studentProfile.user.email}
                    </option>
                  ))}
                </select>
                <select name="templateKey" required className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                  <option value="">Select SOP template</option>
                  {Object.entries(sopTemplates).map(([key, template]) => (
                    <option key={key} value={key}>
                      {template.label}
                    </option>
                  ))}
                </select>
                <input
                  name="startInDays"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  placeholder="Start offset in days"
                />
                <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white">
                  Generate SOP Tasks
                </button>
              </form>
            )}
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
                          Stage: {stageLabel(row.stage)} · Open tasks: {row.openTaskCount} · Pending docs: {row.pendingDocCount}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stageTone(row.stage)}`}>
                        {stageLabel(row.stage)}
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
    </section>
  );
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "neutral" | "blue" | "amber" | "rose";
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
    </article>
  );
}

function taskStatusTone(status: string) {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  if (status === "BLOCKED") return "bg-rose-50 text-rose-700";
  return "bg-gray-100 text-gray-700";
}

const stageOrder = ["INTAKE", "DOCS_PENDING", "APPLICATION_PROGRESS", "CONTRACT_BILLING", "ACTIVE_FOLLOW_UP"] as const;
type CaseStage = (typeof stageOrder)[number];

function getCaseStage(profile: {
  visaStatus: string;
  documents: { id: string }[];
  tasks: { id: string }[];
  contracts: { status: string }[];
  invoices: { status: string }[];
}): CaseStage {
  if (profile.documents.length > 0) return "DOCS_PENDING";
  const hasOpenTasks = profile.tasks.length > 0;
  const latestContract = profile.contracts[0];
  const latestInvoice = profile.invoices[0];

  if (latestContract || latestInvoice) return "CONTRACT_BILLING";
  if (hasOpenTasks || profile.visaStatus === "IN_PROGRESS") return "APPLICATION_PROGRESS";
  if (profile.visaStatus === "APPROVED" || profile.visaStatus === "NOT_REQUIRED") return "ACTIVE_FOLLOW_UP";
  return "INTAKE";
}

function stageLabel(stage: CaseStage) {
  if (stage === "DOCS_PENDING") return "Docs Pending";
  if (stage === "APPLICATION_PROGRESS") return "Application Progress";
  if (stage === "CONTRACT_BILLING") return "Contract & Billing";
  if (stage === "ACTIVE_FOLLOW_UP") return "Active Follow-up";
  return "Intake";
}

function stageTone(stage: CaseStage) {
  if (stage === "DOCS_PENDING") return "bg-amber-50 text-amber-700";
  if (stage === "APPLICATION_PROGRESS") return "bg-blue-50 text-blue-700";
  if (stage === "CONTRACT_BILLING") return "bg-violet-50 text-violet-700";
  if (stage === "ACTIVE_FOLLOW_UP") return "bg-emerald-50 text-emerald-700";
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

const sopTemplates: Record<
  string,
  {
    label: string;
    tasks: Array<{ title: string; priority: TaskPriority; dueInDays: number }>;
  }
> = {
  DOC_COLLECTION: {
    label: "Document Collection Checklist",
    tasks: [
      { title: "Collect passport and identity documents", priority: "HIGH", dueInDays: 1 },
      { title: "Collect academic transcripts and certificates", priority: "HIGH", dueInDays: 2 },
      { title: "Collect English proficiency evidence", priority: "MEDIUM", dueInDays: 3 },
      { title: "Verify financial capacity evidence", priority: "HIGH", dueInDays: 4 },
    ],
  },
  APPLICATION_PREP: {
    label: "Application Preparation Checklist",
    tasks: [
      { title: "Review student profile and eligibility", priority: "HIGH", dueInDays: 1 },
      { title: "Shortlist institutions and course options", priority: "MEDIUM", dueInDays: 2 },
      { title: "Draft and review statement of purpose", priority: "HIGH", dueInDays: 3 },
      { title: "Submit application package", priority: "HIGH", dueInDays: 5 },
    ],
  },
  VISA_FOLLOW_UP: {
    label: "Visa Follow-up Checklist",
    tasks: [
      { title: "Review visa document completeness", priority: "HIGH", dueInDays: 1 },
      { title: "Prepare visa cover notes and checklist", priority: "MEDIUM", dueInDays: 2 },
      { title: "Confirm biometrics/health check requirements", priority: "MEDIUM", dueInDays: 3 },
      { title: "Schedule follow-up call with student", priority: "LOW", dueInDays: 5 },
    ],
  },
};

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

async function createSopTasksAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }

  const studentProfileId = String(formData.get("studentProfileId") ?? "");
  const templateKey = String(formData.get("templateKey") ?? "");
  const startInDaysRaw = Number(formData.get("startInDays") ?? 0);
  const startInDays = Number.isFinite(startInDaysRaw) ? Math.max(0, Math.floor(startInDaysRaw)) : 0;
  const template = sopTemplates[templateKey];

  if (!studentProfileId || !template) {
    redirect("/dashboard/internal-staff");
  }

  const assignment = await prisma.studentAssignment.findFirst({
    where: { studentProfileId, isActive: true },
    include: {
      studentProfile: {
        select: { id: true, userId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!assignment) redirect("/dashboard/internal-staff");

  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin && assignment.assignedToId !== session.user.id) {
    redirect("/dashboard/internal-staff");
  }

  const assigneeId = isAdmin ? assignment.assignedToId : session.user.id;
  const openExisting = await prisma.task.findMany({
    where: {
      studentProfileId,
      assigneeId,
      status: { not: "DONE" },
      title: { in: template.tasks.map((task) => task.title) },
    },
    select: { title: true },
  });
  const existingTitles = new Set(openExisting.map((task) => task.title));
  const now = new Date();
  const tasksToCreate = template.tasks
    .filter((task) => !existingTitles.has(task.title))
    .map((task) => {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + startInDays + task.dueInDays);
      return {
        title: task.title,
        priority: task.priority,
        status: "TODO" as TaskStatus,
        dueDate,
        studentProfileId,
        assigneeId,
        assignerId: session.user.id,
      };
    });

  if (tasksToCreate.length > 0) {
    await prisma.task.createMany({
      data: tasksToCreate,
    });
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: studentProfileId,
        entityType: "TASK",
        entityId: studentProfileId,
        action: `Generated SOP tasks (${template.label}): ${tasksToCreate.length} created`,
      },
    });
  }

  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${assignment.studentProfile.userId}`);
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
  const allowedIds = allowedDocuments.map((document) => document.id);
  await prisma.studentDocument.updateMany({
    where: { id: { in: allowedIds } },
    data: { verificationStatus: status, notes },
  });
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
