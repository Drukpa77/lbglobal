import type { Prisma as PrismaTypes } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = PrismaTypes.TransactionClient | typeof prisma;
type CaseReferenceRow = { caseReference: string };

const CASE_REFERENCE_RE = /^LBG-(\d{4})-(\d+)$/;

export function formatCaseReference(year: number, sequence: number): string {
  const width = sequence > 9999 ? 5 : 4;
  return `LBG-${year}-${String(sequence).padStart(width, "0")}`;
}

export async function generateNextCaseReference(client: DbClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LBG-${year}-`;

  const profileReferences = await client.studentProfile.findMany({
    where: { caseReference: { startsWith: prefix } },
    select: { caseReference: true },
  });
  const visaCaseReferences = await client.visaCase.findMany({
    where: { caseReference: { startsWith: prefix } },
    select: { caseReference: true },
  });

  return formatCaseReference(
    year,
    nextSequenceForYear(year, [...profileReferences, ...visaCaseReferences]),
  );
}

function isDuplicateCaseReferenceError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybe = error as {
    code?: unknown;
    meta?: { target?: unknown };
    message?: unknown;
  };
  if (maybe.code !== "P2002") {
    return false;
  }

  const target = maybe.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  const message = typeof maybe.message === "string" ? maybe.message : "";
  return (
    fields.some((field) => field.toLowerCase().includes("casereference")) ||
    message.includes("StudentProfile_caseReference_key") ||
    message.includes("VisaCase_caseReference_key") ||
    message.toLowerCase().includes("casereference")
  );
}

/**
 * Allocates a fresh case reference and runs `createFn`. Retries when two
 * requests pick the same number at the same time.
 */
export async function runWithUniqueCaseReference<T>(
  client: DbClient,
  createFn: (caseReference: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;
  let nextSequenceOverride: number | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const year = new Date().getFullYear();
    const caseReference =
      nextSequenceOverride === null
        ? await generateNextCaseReference(client)
        : formatCaseReference(year, nextSequenceOverride);
    try {
      return await createFn(caseReference);
    } catch (error) {
      if (isDuplicateCaseReferenceError(error)) {
        lastError = error;
        const failedSequence = sequenceFromCaseReference(caseReference);
        nextSequenceOverride =
          failedSequence === null ? nextSequenceOverride : failedSequence + 1;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error("Failed to allocate a unique case reference.");
}

export async function backfillMissingCaseReferences(client: DbClient = prisma): Promise<number> {
  const profiles = await client.$queryRaw<Array<{ id: string; createdAt: Date }>>`
    SELECT id, createdAt
    FROM StudentProfile
    WHERE caseReference IS NULL
    ORDER BY createdAt ASC, id ASC
  `;

  if (profiles.length === 0) {
    return 0;
  }

  const counters = new Map<number, number>();

  for (const profile of profiles) {
    const year = profile.createdAt.getFullYear();
    const prefix = `LBG-${year}-`;
    let nextSequence = counters.get(year);

    if (nextSequence === undefined) {
      const existingReferences = await client.studentProfile.findMany({
        where: { caseReference: { startsWith: prefix } },
        select: { caseReference: true },
      });

      nextSequence = nextSequenceForYear(year, existingReferences);
    }

    await client.studentProfile.update({
      where: { id: profile.id },
      data: { caseReference: formatCaseReference(year, nextSequence) },
    });

    counters.set(year, nextSequence + 1);
  }

  return profiles.length;
}

function nextSequenceForYear(year: number, references: CaseReferenceRow[]) {
  let nextSequence = 1;
  for (const { caseReference } of references) {
    const match = caseReference.match(CASE_REFERENCE_RE);
    if (!match || Number.parseInt(match[1], 10) !== year) continue;

    const sequence = Number.parseInt(match[2], 10);
    if (Number.isFinite(sequence)) {
      nextSequence = Math.max(nextSequence, sequence + 1);
    }
  }
  return nextSequence;
}

function sequenceFromCaseReference(caseReference: string) {
  const match = caseReference.match(CASE_REFERENCE_RE);
  if (!match) return null;

  const sequence = Number.parseInt(match[2], 10);
  return Number.isFinite(sequence) ? sequence : null;
}
