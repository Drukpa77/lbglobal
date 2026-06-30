import type { CaseStage, SubmissionStatus } from "@prisma/client";

import { caseStageTerminals } from "@/lib/case-stage";

const pendingStatuses: SubmissionStatus[] = ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"];

export function dedupeLatestSubmissionPerStudent<T extends { studentId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.studentId)) continue;
    seen.add(item.studentId);
    deduped.push(item);
  }
  return deduped;
}

export function isActiveCaseSubmission(item: {
  student: { studentProfile: { caseStage: CaseStage } | null };
}) {
  return !item.student.studentProfile || !caseStageTerminals.includes(item.student.studentProfile.caseStage);
}

export function daysUntilDate(targetDate: Date, now: Date) {
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  return Math.round((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
}

export function isVisaExpiringWithinDays(
  visaExpiryDate: Date | null | undefined,
  now: Date,
  maxDays: number,
) {
  if (!visaExpiryDate) return false;
  const days = daysUntilDate(visaExpiryDate, now);
  return days >= 0 && days <= maxDays;
}

export function calculateActiveCaseRatios(items: Array<{ status: SubmissionStatus }>) {
  const denominator = items.length;
  if (denominator === 0) {
    return { conversionRate: 0, pendingRatio: 0 };
  }

  const enrolledCount = items.filter((item) => item.status === "ENROLLED").length;
  const pendingCount = items.filter((item) => pendingStatuses.includes(item.status)).length;
  return {
    conversionRate: Math.round((enrolledCount / denominator) * 100),
    pendingRatio: Math.round((pendingCount / denominator) * 100),
  };
}

export function buildCountByAssignee(
  rows: Array<{ assignedToId: string; _count: { _all: number } }>,
) {
  return new Map(rows.map((row) => [row.assignedToId, row._count._all]));
}

export function uniquePreviewLabels<T>(
  items: T[],
  getLabel: (item: T) => string | null | undefined,
  limit = 2,
) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const label = getLabel(item)?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}
