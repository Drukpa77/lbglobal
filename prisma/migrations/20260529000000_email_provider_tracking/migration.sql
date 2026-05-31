-- AlterTable: OutboundEmailLog
ALTER TABLE `OutboundEmailLog`
    ADD COLUMN `provider` ENUM('POSTMARK', 'GOOGLE_WORKSPACE', 'DEV') NOT NULL DEFAULT 'POSTMARK';
