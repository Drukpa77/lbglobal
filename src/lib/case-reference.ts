import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = PrismaTypes.TransactionClient | typeof prisma;

export function formatCaseReference(year: number, sequence: number): string {
  const width = sequence > 9999 ? 5 : 4;
  return `LBG-${year}-${String(sequence).padStart(width, "0")}`;
}

export async function generateNextCaseReference(client: DbClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LBG-${year}-`;

  const [latestProfile, latestVisaCase] = await Promise.all([
    client.studentProfile.findFirst({
      where: { caseReference: { startsWith: prefix } },
      select: { caseReference: true },
    }),
    client.visaCase.findFirst({
      where: { caseReference: { startsWith: prefix } },
      select: { caseReference: true },
    }),
  ]);

  let nextSequence = 1;
  for (const latest of [latestProfile, latestVisaCase]) {
    if (latest?.caseReference) {
      const match = latest.caseReference.match(/^LBG-\d{4}-(\d+)$/);
      if (match) {
        nextSequence = Math.max(nextSequence, Number.parseInt(match[1], 10) + 1);
      }
    }
  }

  return formatCaseReference(year, nextSequence);
}

function isDuplicateCaseReferenceError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.toLowerCase().includes("casereference"));
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
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const caseReference = await generateNextCaseReference(client);
    try {
      return await createFn(caseReference);
    } catch (error) {
      if (isDuplicateCaseReferenceError(error)) {
        lastError = error;
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
      const latest = await client.studentProfile.findFirst({
        where: { caseReference: { startsWith: prefix } },
        select: { caseReference: true },
      });

      nextSequence = 1;
      if (latest?.caseReference) {
        const match = latest.caseReference.match(/^LBG-\d{4}-(\d+)$/);
        if (match) {
          nextSequence = Number.parseInt(match[1], 10) + 1;
        }
      }
    }

    await client.studentProfile.update({
      where: { id: profile.id },
      data: { caseReference: formatCaseReference(year, nextSequence) },
    });

    counters.set(year, nextSequence + 1);
  }

  return profiles.length;
}
