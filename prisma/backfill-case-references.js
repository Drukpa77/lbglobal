/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function formatCaseReference(year, sequence) {
  return `LBG-${year}-${String(sequence).padStart(4, "0")}`;
}

async function backfillMissingCaseReferences(client) {
  const profiles = await client.$queryRaw`
    SELECT id, createdAt
    FROM StudentProfile
    WHERE caseReference IS NULL
    ORDER BY createdAt ASC, id ASC
  `;

  if (profiles.length === 0) {
    return 0;
  }

  const counters = new Map();

  for (const profile of profiles) {
    const createdAt = profile.createdAt instanceof Date
      ? profile.createdAt
      : new Date(profile.createdAt);
    const year = createdAt.getFullYear();
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

async function main() {
  const updated = await backfillMissingCaseReferences(prisma);
  console.log(`Backfilled ${updated} student case reference(s).`);

  await prisma.$executeRawUnsafe(
    "ALTER TABLE `StudentProfile` MODIFY `caseReference` VARCHAR(191) NOT NULL",
  );
  console.log("Set caseReference column to NOT NULL.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
