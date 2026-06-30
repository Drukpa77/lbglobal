-- Allow longer chat/thread messages (was VARCHAR(191)).
ALTER TABLE `Message`
  MODIFY COLUMN `content` TEXT NOT NULL;
