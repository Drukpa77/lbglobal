import { createHash, randomUUID } from "node:crypto";

import type { Prisma, StoredFileCleanupJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/storage";

const DEFAULT_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const MAX_ERROR_LENGTH = 2000;

type CleanupDb = typeof prisma | Prisma.TransactionClient;

type EnqueueStoredFileCleanupInput = {
  storagePath: string;
  sourceType?: string;
  sourceId?: string;
};

export type StoredFileCleanupResult = {
  checked: number;
  claimed: number;
  succeeded: number;
  retrying: number;
  failed: number;
};

export function storedFileCleanupHash(storagePath: string) {
  return createHash("sha256").update(storagePath).digest("hex");
}

export async function enqueueStoredFileCleanup(
  input: EnqueueStoredFileCleanupInput,
  db: CleanupDb = prisma,
) {
  const storagePath = input.storagePath.trim();
  if (!storagePath) return null;

  return db.storedFileCleanupJob.upsert({
    where: { storagePathHash: storedFileCleanupHash(storagePath) },
    create: {
      storagePath,
      storagePathHash: storedFileCleanupHash(storagePath),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
    update: {
      storagePath,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      completedAt: null,
    },
  });
}

export async function processStoredFileCleanupQueue({
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  batchSize?: number;
} = {}): Promise<StoredFileCleanupResult> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);
  const lockId = randomUUID();

  const candidates = await prisma.storedFileCleanupJob.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "PROCESSING", lockedAt: { lte: staleBefore } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(batchSize, 100)),
  });

  const result: StoredFileCleanupResult = {
    checked: candidates.length,
    claimed: 0,
    succeeded: 0,
    retrying: 0,
    failed: 0,
  };

  for (const job of candidates) {
    const claimed = await claimCleanupJob(job, lockId, now, staleBefore);
    if (!claimed) continue;

    result.claimed += 1;

    try {
      await deleteStoredFile(job.storagePath);
      await prisma.storedFileCleanupJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          completedAt: new Date(),
        },
      });
      result.succeeded += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const terminalFailure = attempts >= MAX_ATTEMPTS;
      await prisma.storedFileCleanupJob.update({
        where: { id: job.id },
        data: {
          status: terminalFailure ? "FAILED" : "PENDING",
          attempts,
          nextAttemptAt: nextRetryAt(attempts),
          lockedAt: null,
          lockedBy: null,
          lastError: formatCleanupError(error),
        },
      });

      if (terminalFailure) {
        result.failed += 1;
      } else {
        result.retrying += 1;
      }
    }
  }

  return result;
}

async function claimCleanupJob(
  job: StoredFileCleanupJob,
  lockId: string,
  now: Date,
  staleBefore: Date,
) {
  const where =
    job.status === "PROCESSING"
      ? { id: job.id, status: "PROCESSING" as const, lockedAt: { lte: staleBefore } }
      : {
          id: job.id,
          status: "PENDING" as const,
          attempts: { lt: MAX_ATTEMPTS },
          nextAttemptAt: { lte: now },
        };

  const claimed = await prisma.storedFileCleanupJob.updateMany({
    where,
    data: {
      status: "PROCESSING",
      lockedAt: new Date(),
      lockedBy: lockId,
    },
  });

  return claimed.count === 1;
}

function nextRetryAt(attempts: number) {
  const delayMinutes = Math.min(60 * 24, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function formatCleanupError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}
