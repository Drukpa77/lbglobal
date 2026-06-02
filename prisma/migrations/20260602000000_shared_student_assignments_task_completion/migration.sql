-- Drop older duplicate assignment rows before adding the unique pair.
-- Keeps the newest row for each student/staff pair.
DELETE sa_old
FROM `StudentAssignment` sa_old
JOIN `StudentAssignment` sa_new
  ON sa_old.`studentProfileId` = sa_new.`studentProfileId`
  AND sa_old.`assignedToId` = sa_new.`assignedToId`
  AND (
    (sa_old.`isActive` = false AND sa_new.`isActive` = true)
    OR (
      sa_old.`isActive` = sa_new.`isActive`
      AND (
        sa_old.`createdAt` < sa_new.`createdAt`
        OR (sa_old.`createdAt` = sa_new.`createdAt` AND sa_old.`id` < sa_new.`id`)
      )
    )
  );

-- Task completion attribution for contribution reporting.
ALTER TABLE `Task`
  ADD COLUMN `completedById` VARCHAR(191) NULL,
  ADD COLUMN `completedAt` DATETIME(3) NULL;

UPDATE `Task`
SET `completedById` = `assigneeId`,
    `completedAt` = `updatedAt`
WHERE `status` = 'DONE'
  AND `completedById` IS NULL;

CREATE INDEX `Task_completedById_idx` ON `Task`(`completedById`);

CREATE INDEX `StudentAssignment_assignedToId_isActive_idx`
  ON `StudentAssignment`(`assignedToId`, `isActive`);

CREATE INDEX `StudentAssignment_studentProfileId_isActive_idx`
  ON `StudentAssignment`(`studentProfileId`, `isActive`);

CREATE UNIQUE INDEX `StudentAssignment_studentProfileId_assignedToId_key`
  ON `StudentAssignment`(`studentProfileId`, `assignedToId`);

ALTER TABLE `Task`
  ADD CONSTRAINT `Task_completedById_fkey`
  FOREIGN KEY (`completedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
