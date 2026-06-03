import type { CaseStage, Role } from "@prisma/client";

import { caseStageOrder } from "@/lib/case-stage";
import { prisma } from "@/lib/prisma";

export const CONTRIBUTION_STAGE_WEIGHT = 70;
export const CONTRIBUTION_DOC_WEIGHT = 15;
export const CONTRIBUTION_TASK_WEIGHT = 15;
const DOC_TARGET_PER_CASE = 10;
const CASE_WORK_TARGET_PER_CASE = 12;
const TERMINAL_STAGE_RANK = caseStageOrder.length;

/** Relative weights inside the task (case work) pool. */
const DONE_TASK_UNITS = 1;
const OPEN_ASSIGNED_TASK_UNITS = 0.6;
const ASSIGNMENT_ACTIVITY_UNITS = 0.5;
const TASK_ACTIVITY_UNITS = 0.25;
const ACTIVE_TEAM_UNITS = 0.35;

export type ContributionRow = {
  userId: string;
  name: string;
  email: string;
  role: Role | "UNKNOWN";
  stagePts: number;
  docPts: number;
  taskPts: number;
  totalPts: number;
  stageCount: number;
  docCount: number;
  /** Weighted case-work units (tasks, team, and case actions combined). */
  taskCount: number;
  doneTaskCount: number;
  openTaskCount: number;
  caseActionCount: number;
  teamSlotCount: number;
};

export type ContributionTotals = {
  stageMoves: number;
  docs: number;
  doneTasks: number;
  openAssignedTasks: number;
  caseWorkUnits: number;
};

export type ContributionResult = {
  rows: ContributionRow[];
  totals: ContributionTotals;
};

/**
 * Compute weighted per-user contribution scores across three pools:
 *   - Stage pool (70 pts): based on net forward stage progress from CASE_STAGE logs
 *   - Document pool (15 pts): split equally across every uploaded document
 *   - Task pool (15 pts): case work — completed tasks, open assigned tasks, team
 *     membership, and ASSIGNMENT / TASK activity on the case
 *
 * Pools are fixed; if a pool has zero items it stays unallocated (no auto-rebalance).
 *
 * Pass `studentProfileId` to scope to a single student. Otherwise scope is global.
 */
export async function getContributions(params?: {
  studentProfileId?: string;
}): Promise<ContributionResult> {
  const { studentProfileId } = params ?? {};

  const caseScope = studentProfileId ? { targetStudentProfileId: studentProfileId } : {};

  const [
    stageEvents,
    docGroups,
    doneTaskGroups,
    openTaskGroups,
    caseActionGroups,
    assignmentActionGroups,
    assignedTeam,
    scopedCaseCountRaw,
  ] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        entityType: "CASE_STAGE",
        ...(studentProfileId ? { targetStudentProfileId: studentProfileId } : {}),
      },
      select: {
        actorId: true,
        metadata: true,
        createdAt: true,
        id: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.studentDocument.groupBy({
      by: ["uploadedById"],
      where: studentProfileId ? { studentProfileId } : {},
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["completedById"],
      where: {
        status: "DONE",
        completedById: { not: null },
        ...(studentProfileId ? { studentProfileId } : {}),
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        status: { not: "DONE" },
        ...(studentProfileId ? { studentProfileId } : {}),
      },
      _count: { _all: true },
    }),
    prisma.activityLog.groupBy({
      by: ["actorId"],
      where: {
        ...caseScope,
        entityType: { in: ["ASSIGNMENT", "TASK"] },
      },
      _count: { _all: true },
    }),
    prisma.activityLog.groupBy({
      by: ["actorId"],
      where: {
        ...caseScope,
        entityType: "ASSIGNMENT",
      },
      _count: { _all: true },
    }),
    studentProfileId
      ? prisma.studentAssignment.findMany({
          where: { studentProfileId, isActive: true },
          select: { assignedToId: true },
        })
      : Promise.resolve([]),
    studentProfileId
      ? Promise.resolve(1)
      : prisma.studentProfile.count(),
  ]);

  const stageProgressByActor = new Map<string, number>();
  for (const event of stageEvents) {
    const delta = getStageDeltaFromMetadata(event.metadata);
    if (delta === 0) continue;
    stageProgressByActor.set(
      event.actorId,
      (stageProgressByActor.get(event.actorId) ?? 0) + delta,
    );
  }
  for (const [actorId, net] of stageProgressByActor) {
    if (net < 0) {
      stageProgressByActor.set(actorId, 0);
    }
  }
  const totalStageMoves = Array.from(stageProgressByActor.values()).reduce(
    (sum, units) => sum + units,
    0,
  );
  const totalDocs = docGroups.reduce(
    (sum, row) => sum + (row._count?._all ?? 0),
    0,
  );
  const totalDoneTasks = doneTaskGroups.reduce(
    (sum, row) => sum + (row._count?._all ?? 0),
    0,
  );
  const totalOpenAssignedTasks = openTaskGroups.reduce(
    (sum, row) => sum + (row._count?._all ?? 0),
    0,
  );
  const totalCaseActions = caseActionGroups.reduce(
    (sum, row) => sum + (row._count?._all ?? 0),
    0,
  );

  const caseWorkUnitsByUser = new Map<string, number>();
  const doneTaskCountByUser = new Map<string, number>();
  const openTaskCountByUser = new Map<string, number>();
  const caseActionCountByUser = new Map<string, number>();
  const teamSlotCountByUser = new Map<string, number>();

  function addCaseWork(userId: string, units: number) {
    if (!userId || units <= 0) return;
    caseWorkUnitsByUser.set(userId, (caseWorkUnitsByUser.get(userId) ?? 0) + units);
  }

  for (const group of doneTaskGroups) {
    if (!group.completedById) continue;
    const count = group._count?._all ?? 0;
    doneTaskCountByUser.set(group.completedById, count);
    addCaseWork(group.completedById, count * DONE_TASK_UNITS);
  }

  for (const group of openTaskGroups) {
    const count = group._count?._all ?? 0;
    openTaskCountByUser.set(group.assigneeId, count);
    addCaseWork(group.assigneeId, count * OPEN_ASSIGNED_TASK_UNITS);
  }

  for (const group of caseActionGroups) {
    const count = group._count?._all ?? 0;
    caseActionCountByUser.set(group.actorId, count);
    addCaseWork(group.actorId, count * TASK_ACTIVITY_UNITS);
  }

  for (const assignment of assignedTeam) {
    teamSlotCountByUser.set(
      assignment.assignedToId,
      (teamSlotCountByUser.get(assignment.assignedToId) ?? 0) + 1,
    );
    addCaseWork(assignment.assignedToId, ACTIVE_TEAM_UNITS);
  }

  // ASSIGNMENT logs are weighted slightly higher than generic TASK logs (already in caseActionGroups).
  for (const group of assignmentActionGroups) {
    const extra = (group._count?._all ?? 0) * (ASSIGNMENT_ACTIVITY_UNITS - TASK_ACTIVITY_UNITS);
    if (extra > 0) addCaseWork(group.actorId, extra);
  }

  const totalCaseWorkUnits = Array.from(caseWorkUnitsByUser.values()).reduce(
    (sum, units) => sum + units,
    0,
  );
  const scopedCaseCount = Math.max(scopedCaseCountRaw, 1);
  const stageDenominator = Math.max(
    totalStageMoves,
    scopedCaseCount * caseStageOrder.length,
  );
  const docDenominator = Math.max(totalDocs, scopedCaseCount * DOC_TARGET_PER_CASE);
  const taskDenominator = Math.max(
    totalCaseWorkUnits,
    scopedCaseCount * CASE_WORK_TARGET_PER_CASE,
  );

  const userIdSet = new Set<string>();
  for (const actorId of stageProgressByActor.keys()) userIdSet.add(actorId);
  for (const row of docGroups) userIdSet.add(row.uploadedById);
  for (const userId of caseWorkUnitsByUser.keys()) userIdSet.add(userId);
  for (const row of assignedTeam) userIdSet.add(row.assignedToId);

  const userIds = Array.from(userIdSet);
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, role: true },
        });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rowMap = new Map<string, ContributionRow>();

  function ensureRow(userId: string): ContributionRow {
    let row = rowMap.get(userId);
    if (!row) {
      const user = userMap.get(userId);
      row = {
        userId,
        name: user?.name ?? user?.email ?? "(removed user)",
        email: user?.email ?? "",
        role: (user?.role ?? "UNKNOWN") as ContributionRow["role"],
        stagePts: 0,
        docPts: 0,
        taskPts: 0,
        totalPts: 0,
        stageCount: 0,
        docCount: 0,
        taskCount: 0,
        doneTaskCount: 0,
        openTaskCount: 0,
        caseActionCount: 0,
        teamSlotCount: 0,
      };
      rowMap.set(userId, row);
    }
    return row;
  }

  for (const [actorId, units] of stageProgressByActor.entries()) {
    const row = ensureRow(actorId);
    row.stageCount = units;
    row.stagePts = (units / stageDenominator) * CONTRIBUTION_STAGE_WEIGHT;
  }

  for (const group of docGroups) {
    const count = group._count?._all ?? 0;
    const row = ensureRow(group.uploadedById);
    row.docCount = count;
    row.docPts = (count / docDenominator) * CONTRIBUTION_DOC_WEIGHT;
  }

  for (const [userId, units] of caseWorkUnitsByUser.entries()) {
    const row = ensureRow(userId);
    row.taskCount = units;
    row.doneTaskCount = doneTaskCountByUser.get(userId) ?? 0;
    row.openTaskCount = openTaskCountByUser.get(userId) ?? 0;
    row.caseActionCount = caseActionCountByUser.get(userId) ?? 0;
    row.teamSlotCount = teamSlotCountByUser.get(userId) ?? 0;
    row.taskPts = (units / taskDenominator) * CONTRIBUTION_TASK_WEIGHT;
  }

  for (const assignment of assignedTeam) {
    ensureRow(assignment.assignedToId);
  }

  for (const row of rowMap.values()) {
    row.totalPts = row.stagePts + row.docPts + row.taskPts;
  }

  const rows = Array.from(rowMap.values()).sort((a, b) => b.totalPts - a.totalPts);

  return {
    rows,
    totals: {
      stageMoves: totalStageMoves,
      docs: totalDocs,
      doneTasks: totalDoneTasks,
      openAssignedTasks: totalOpenAssignedTasks,
      caseWorkUnits: totalCaseWorkUnits,
    },
  };
}

function getStageDeltaFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const fromRaw = (metadata as { from?: unknown }).from;
  const toRaw = (metadata as { to?: unknown }).to;
  if (typeof fromRaw !== "string" || typeof toRaw !== "string") return 0;

  const fromRank = getStageRank(fromRaw);
  const toRank = getStageRank(toRaw);
  if (fromRank === null || toRank === null) return 0;

  return toRank - fromRank;
}

function getStageRank(stage: string): number | null {
  const linearIndex = caseStageOrder.indexOf(stage as CaseStage);
  if (linearIndex >= 0) return linearIndex;

  if (isTerminalStage(stage)) return TERMINAL_STAGE_RANK;
  return null;
}

function isTerminalStage(stage: string): boolean {
  return (
    stage === "VISA_GRANTED" ||
    stage === "VISA_REFUSED" ||
    stage === "AAT_CASE" ||
    stage === "WITHDRAWN"
  );
}
