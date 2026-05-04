import type { CaseStage, Role } from "@prisma/client";

import { caseStageOrder } from "@/lib/case-stage";
import { prisma } from "@/lib/prisma";

export const CONTRIBUTION_STAGE_WEIGHT = 70;
export const CONTRIBUTION_DOC_WEIGHT = 15;
export const CONTRIBUTION_TASK_WEIGHT = 15;
const DOC_TARGET_PER_CASE = 10;
const DONE_TASK_TARGET_PER_CASE = 10;
const TERMINAL_STAGE_RANK = caseStageOrder.length;

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
  taskCount: number;
};

export type ContributionTotals = {
  stageMoves: number;
  docs: number;
  doneTasks: number;
};

export type ContributionResult = {
  rows: ContributionRow[];
  totals: ContributionTotals;
};

/**
 * Compute weighted per-user contribution scores across three pools:
 *   - Stage pool (70 pts): based on net forward stage progress from CASE_STAGE logs
 *   - Document pool (15 pts): split equally across every uploaded document
 *   - Task pool (15 pts): split equally across every task with status=DONE
 *
 * Pools are fixed; if a pool has zero items it stays unallocated (no auto-rebalance).
 *
 * Pass `studentProfileId` to scope to a single student. Otherwise scope is global.
 */
export async function getContributions(params?: {
  studentProfileId?: string;
}): Promise<ContributionResult> {
  const { studentProfileId } = params ?? {};

  const [stageEvents, docGroups, taskGroups, scopedCaseCountRaw] = await Promise.all([
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
      by: ["assigneeId"],
      where: {
        status: "DONE",
        ...(studentProfileId ? { studentProfileId } : {}),
      },
      _count: { _all: true },
    }),
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
  const totalDoneTasks = taskGroups.reduce(
    (sum, row) => sum + (row._count?._all ?? 0),
    0,
  );
  const scopedCaseCount = Math.max(scopedCaseCountRaw, 1);
  const stageDenominator = Math.max(
    totalStageMoves,
    scopedCaseCount * caseStageOrder.length,
  );
  const docDenominator = Math.max(totalDocs, scopedCaseCount * DOC_TARGET_PER_CASE);
  const taskDenominator = Math.max(
    totalDoneTasks,
    scopedCaseCount * DONE_TASK_TARGET_PER_CASE,
  );

  const userIdSet = new Set<string>();
  for (const actorId of stageProgressByActor.keys()) userIdSet.add(actorId);
  for (const row of docGroups) userIdSet.add(row.uploadedById);
  for (const row of taskGroups) userIdSet.add(row.assigneeId);

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

  for (const group of taskGroups) {
    const count = group._count?._all ?? 0;
    const row = ensureRow(group.assigneeId);
    row.taskCount = count;
    row.taskPts = (count / taskDenominator) * CONTRIBUTION_TASK_WEIGHT;
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
