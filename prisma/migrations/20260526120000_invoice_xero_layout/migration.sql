-- AlterTable: InvoiceLineItem
ALTER TABLE `InvoiceLineItem`
    ADD COLUMN `taxable` BOOLEAN NOT NULL DEFAULT TRUE,
    MODIFY COLUMN `description` TEXT NOT NULL,
    MODIFY COLUMN `quantity` DOUBLE NOT NULL DEFAULT 1;

-- AlterTable: CompanySettings
ALTER TABLE `CompanySettings`
    ADD COLUMN `legalName` VARCHAR(191) NULL,
    ADD COLUMN `abn` VARCHAR(191) NULL,
    ADD COLUMN `bankDetails` TEXT NULL,
    ADD COLUMN `defaultTaxRate` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `defaultTaxLabel` VARCHAR(191) NOT NULL DEFAULT 'GST',
    ADD COLUMN `invoiceFooter` TEXT NULL;
