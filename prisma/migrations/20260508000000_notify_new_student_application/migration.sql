-- Extend the WorkflowNotificationType enum with NEW_STUDENT_APPLICATION so
-- sub-admins and admins can be alerted when a student submits the public
-- inquiry form. Also re-asserts DOCUMENT_REPLACEMENT_UPLOADED, which was
-- introduced in the Prisma schema after the original baseline migration.
ALTER TABLE `WorkflowNotification`
MODIFY COLUMN `type` ENUM(
  'DOCUMENT_RETURNED',
  'DOCUMENT_REVERIFIED',
  'DOCUMENT_RETURN_DISPUTED',
  'DOCUMENT_RETURN_FOLLOW_UP',
  'DOCUMENT_REPLACEMENT_UPLOADED',
  'NEW_STUDENT_APPLICATION'
) NOT NULL;
