-- AlterTable
ALTER TABLE `Invoice`
    ADD COLUMN `discountAmount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `taxRate` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `shippingAmount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `paymentTerms` VARCHAR(191) NULL,
    ADD COLUMN `remarks` TEXT NULL,
    ADD COLUMN `companyName` VARCHAR(191) NULL,
    ADD COLUMN `companyAddress` TEXT NULL,
    ADD COLUMN `companyContact` TEXT NULL,
    ADD COLUMN `companyLogoUrl` VARCHAR(191) NULL,
    ADD COLUMN `billToName` VARCHAR(191) NULL,
    ADD COLUMN `billToCompany` VARCHAR(191) NULL,
    ADD COLUMN `billToAddress` TEXT NULL,
    ADD COLUMN `billToPhone` VARCHAR(191) NULL,
    ADD COLUMN `billToEmail` VARCHAR(191) NULL,
    ADD COLUMN `shipToName` VARCHAR(191) NULL,
    ADD COLUMN `shipToCompany` VARCHAR(191) NULL,
    ADD COLUMN `shipToAddress` TEXT NULL,
    ADD COLUMN `shipToPhone` VARCHAR(191) NULL,
    ADD COLUMN `shipToEmail` VARCHAR(191) NULL,
    MODIFY COLUMN `htmlSnapshot` TEXT NOT NULL;

-- CreateTable
CREATE TABLE `CompanySettings` (
    `id` VARCHAR(191) NOT NULL,
    `singleton` BOOLEAN NOT NULL DEFAULT true,
    `companyName` VARCHAR(191) NOT NULL DEFAULT 'L&B Global',
    `addressLine` TEXT NULL,
    `contactDetails` TEXT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `defaultCurrency` VARCHAR(191) NOT NULL DEFAULT 'AUD',
    `paymentTerms` VARCHAR(191) NULL,
    `paymentRemarks` TEXT NULL,
    `invoicePrefix` VARCHAR(191) NOT NULL DEFAULT 'INV-',
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CompanySettings_singleton_key`(`singleton`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
