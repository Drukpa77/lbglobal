-- Add per-client workflow steps and the current-step pointer on VisaCase.

ALTER TABLE `VisaCase` ADD COLUMN `currentStepId` VARCHAR(191) NULL;

CREATE TABLE `CaseWorkflowStep` (
  `id` VARCHAR(191) NOT NULL,
  `visaCaseId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `templateStageKey` ENUM(
    'CONSULTATION_AND_DOCUMENTATION',
    'RESEARCH_PROPOSAL',
    'ENROLMENT_PROCESS',
    'CONDITIONAL_OFFER_LETTER',
    'UNCONDITIONAL_OFFER_LETTER',
    'AWAITING_TUITION_PAYMENT',
    'TUITION_FEE_AND_OSHC_PAID',
    'COE_RECEIVED',
    'GTE_PROCESS',
    'VISA_DRAFT_PREPARATION',
    'VISA_LODGMENT',
    'VISA_GRANTED',
    'VISA_REFUSED',
    'AAT_CASE',
    'WITHDRAWN'
  ) NULL,
  `isCustom` BOOLEAN NOT NULL DEFAULT false,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CaseWorkflowStep_visaCaseId_position_idx`(`visaCaseId`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CaseWorkflowStep`
  ADD CONSTRAINT `CaseWorkflowStep_visaCaseId_fkey`
  FOREIGN KEY (`visaCaseId`) REFERENCES `VisaCase`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
