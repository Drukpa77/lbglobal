import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export function formatCaseReference(year: number, sequence: number): string {
  return `LBG-${year}-${String(sequence).padStart(4, "0")}`;
}

export async function generateNextCaseReference(client: DbClient = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LBG-${year}-`;

  const latest = await client.studentProfile.findFirst({
    where: { caseReference: { startsWith: prefix } },
    orderBy: { caseReference: "desc" },
    select: { caseReference: true },
  });

  let nextSequence = 1;
  if (latest?.caseReference) {
    const match = latest.caseReference.match(/^LBG-\d{4}-(\d+)$/);
    if (match) {
      nextSequence = Number.parseInt(match[1], 10) + 1;
    }
  }

  return formatCaseReference(year, nextSequence);
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
        orderBy: { caseReference: "desc" },
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
