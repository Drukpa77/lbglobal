CREATE TABLE `StoredFileCleanupJob` (
  `id`              VARCHAR(191) NOT NULL,
  `storagePath`     TEXT         NOT NULL,
  `storagePathHash` VARCHAR(64)  NOT NULL,
  `sourceType`      VARCHAR(191) NULL,
  `sourceId`        VARCHAR(191) NULL,
  `status`          ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts`        INTEGER      NOT NULL DEFAULT 0,
  `nextAttemptAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lockedAt`        DATETIME(3)  NULL,
  `lockedBy`        VARCHAR(191) NULL,
  `lastError`       TEXT         NULL,
  `completedAt`     DATETIME(3)  NULL,
  `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
);

CREATE UNIQUE INDEX `StoredFileCleanupJob_storagePathHash_key`
  ON `StoredFileCleanupJob`(`storagePathHash`);

CREATE INDEX `StoredFileCleanupJob_status_nextAttemptAt_idx`
  ON `StoredFileCleanupJob`(`status`, `nextAttemptAt`);

CREATE INDEX `StoredFileCleanupJob_lockedAt_idx`
  ON `StoredFileCleanupJob`(`lockedAt`);

CREATE INDEX `StoredFileCleanupJob_sourceType_sourceId_idx`
  ON `StoredFileCleanupJob`(`sourceType`, `sourceId`);
