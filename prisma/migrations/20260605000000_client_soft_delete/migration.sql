-- Soft-delete clients so records can be restored from the Deleted Clients tab.
ALTER TABLE `User`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `deletedById` VARCHAR(191) NULL;

CREATE INDEX `User_deletedAt_idx` ON `User`(`deletedAt`);
CREATE INDEX `User_deletedById_idx` ON `User`(`deletedById`);

ALTER TABLE `User`
  ADD CONSTRAINT `User_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
