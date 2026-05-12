-- AlterTable
ALTER TABLE `StudentProfile`
    ADD COLUMN `currentAddress` TEXT NULL,
    ADD COLUMN `emergencyContactName` VARCHAR(191) NULL,
    ADD COLUMN `emergencyContactEmail` VARCHAR(191) NULL,
    ADD COLUMN `emergencyContactPhone` VARCHAR(191) NULL,
    ADD COLUMN `emergencyContactAddress` TEXT NULL;
