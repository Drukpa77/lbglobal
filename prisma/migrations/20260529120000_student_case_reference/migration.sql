-- AlterTable
ALTER TABLE `StudentProfile` ADD COLUMN `caseReference` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `StudentProfile_caseReference_key` ON `StudentProfile`(`caseReference`);
