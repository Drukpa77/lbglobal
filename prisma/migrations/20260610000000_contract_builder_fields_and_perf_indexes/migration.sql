-- Contract builder: new fields, htmlSnapshot → LONGTEXT, contractNumber unique index
ALTER TABLE `Contract`
  MODIFY COLUMN `htmlSnapshot` LONGTEXT NOT NULL,
  ADD COLUMN `contractNumber`   VARCHAR(191) NULL,
  ADD COLUMN `contractDate`     VARCHAR(191) NULL,
  ADD COLUMN `applicantTitle`   VARCHAR(191) NULL,
  ADD COLUMN `applicantName`    VARCHAR(191) NULL,
  ADD COLUMN `applicantCid`     VARCHAR(191) NULL,
  ADD COLUMN `organizationName` VARCHAR(191) NULL,
  ADD COLUMN `hasDependent`     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN `dependentName`    VARCHAR(191) NULL,
  ADD COLUMN `witnessName`      VARCHAR(191) NULL,
  ADD COLUMN `witnessCid`       VARCHAR(191) NULL,
  ADD COLUMN `witnessContact`   VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Contract_contractNumber_key`
  ON `Contract`(`contractNumber`);

CREATE INDEX `Contract_studentProfileId_status_idx`
  ON `Contract`(`studentProfileId`, `status`);

-- Performance indexes: User
CREATE INDEX `User_role_idx` ON `User`(`role`);
CREATE INDEX `User_role_deletedAt_idx` ON `User`(`role`, `deletedAt`);

-- Performance indexes: StudentProfile
CREATE INDEX `StudentProfile_caseStage_idx` ON `StudentProfile`(`caseStage`);
CREATE INDEX `StudentProfile_nextFollowUpDate_idx` ON `StudentProfile`(`nextFollowUpDate`);
CREATE INDEX `StudentProfile_visaExpiryDate_idx` ON `StudentProfile`(`visaExpiryDate`);

-- Performance indexes: QuestionnaireSubmission
CREATE INDEX `QuestionnaireSubmission_assignedToId_submittedAt_idx`
  ON `QuestionnaireSubmission`(`assignedToId`, `submittedAt`);
CREATE INDEX `QuestionnaireSubmission_studentId_submittedAt_idx`
  ON `QuestionnaireSubmission`(`studentId`, `submittedAt`);
CREATE INDEX `QuestionnaireSubmission_status_submittedAt_idx`
  ON `QuestionnaireSubmission`(`status`, `submittedAt`);
CREATE INDEX `QuestionnaireSubmission_assignedToId_status_idx`
  ON `QuestionnaireSubmission`(`assignedToId`, `status`);
CREATE INDEX `QuestionnaireSubmission_submittedAt_idx`
  ON `QuestionnaireSubmission`(`submittedAt`);

-- Performance indexes: StaffTeamMembership
CREATE INDEX `StaffTeamMembership_managerId_idx`
  ON `StaffTeamMembership`(`managerId`);
CREATE INDEX `StaffTeamMembership_internalStaffId_idx`
  ON `StaffTeamMembership`(`internalStaffId`);

-- Performance indexes: Task
CREATE INDEX `Task_studentProfileId_status_idx` ON `Task`(`studentProfileId`, `status`);
CREATE INDEX `Task_assigneeId_status_idx` ON `Task`(`assigneeId`, `status`);
CREATE INDEX `Task_status_dueDate_idx` ON `Task`(`status`, `dueDate`);

-- Performance indexes: StudentDocument
CREATE INDEX `StudentDocument_replacedDocumentId_idx`
  ON `StudentDocument`(`replacedDocumentId`);
CREATE INDEX `StudentDocument_studentProfileId_verificationStatus_idx`
  ON `StudentDocument`(`studentProfileId`, `verificationStatus`);
CREATE INDEX `StudentDocument_verificationStatus_createdAt_idx`
  ON `StudentDocument`(`verificationStatus`, `createdAt`);
