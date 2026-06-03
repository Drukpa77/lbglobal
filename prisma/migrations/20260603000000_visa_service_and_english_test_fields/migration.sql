-- General visa CRM: service type on client profile + structured English test fields
ALTER TABLE `StudentProfile`
  ADD COLUMN `visaServiceType` VARCHAR(191) NULL,
  ADD COLUMN `englishTestType` VARCHAR(191) NULL;
