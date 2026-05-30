-- AlterTable: OutboundEmailLog
ALTER TABLE `OutboundEmailLog`
    ADD COLUMN `deliveredAt` DATETIME(3) NULL,
    ADD COLUMN `bouncedAt` DATETIME(3) NULL,
    ADD COLUMN `lastProviderEvent` VARCHAR(191) NULL,
    ADD COLUMN `lastProviderEventAt` DATETIME(3) NULL,
    ADD COLUMN `providerEventData` JSON NULL;
