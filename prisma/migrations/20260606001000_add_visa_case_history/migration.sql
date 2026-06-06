CREATE TABLE `VisaCase` (
  `id` VARCHAR(191) NOT NULL,
  `studentProfileId` VARCHAR(191) NOT NULL,
  `caseReference` VARCHAR(191) NOT NULL,
  `visaServiceType` VARCHAR(191) NULL,
  `otherServiceDescription` TEXT NULL,
  `caseStage` ENUM(
    'CONSULTATION_AND_DOCUMENTATION',
    'RESEARCH_PROPOSAL',
    'ENROLMENT_PROCESS',
    'CONDITIONAL_OFFER_LETTER',
    'UNCONDITIONAL_OFFER_LETTER',
    'TUITION_FEE_AND_OSHC_PAID',
    'COE_RECEIVED',
    'GTE_PROCESS',
    'VISA_DRAFT_PREPARATION',
    'VISA_LODGMENT',
    'VISA_GRANTED',
    'VISA_REFUSED',
    'AAT_CASE',
    'WITHDRAWN'
  ) NOT NULL DEFAULT 'CONSULTATION_AND_DOCUMENTATION',
  `visaStatus` ENUM(
    'NOT_STARTED',
    'DOCUMENTS_IN_PROGRESS',
    'APPLIED',
    'INTERVIEW_SCHEDULED',
    'ADDITIONAL_DOCS_REQUESTED',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
  ) NOT NULL DEFAULT 'NOT_STARTED',
  `status` ENUM('ACTIVE', 'COMPLETED', 'SUPERSEDED', 'WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
  `courseStartDate` DATETIME(3) NULL,
  `courseEndDate` DATETIME(3) NULL,
  `visaExpiryDate` DATETIME(3) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `VisaCase_caseReference_key`(`caseReference`),
  INDEX `VisaCase_studentProfileId_status_idx`(`studentProfileId`, `status`),
  INDEX `VisaCase_startedAt_idx`(`startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VisaCase`
  ADD CONSTRAINT `VisaCase_studentProfileId_fkey`
  FOREIGN KEY (`studentProfileId`) REFERENCES `StudentProfile`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
