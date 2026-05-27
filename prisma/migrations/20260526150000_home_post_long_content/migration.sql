-- Expand HomePost content columns so long-form articles fit.
-- MySQL/MariaDB default for `String` is VARCHAR(191) which truncates
-- rich blog content. Switch the long text fields to TEXT / LONGTEXT.

ALTER TABLE `HomePost` MODIFY COLUMN `content` TEXT NOT NULL;
ALTER TABLE `HomePost` MODIFY COLUMN `contentHtml` LONGTEXT NOT NULL;
ALTER TABLE `HomePost` MODIFY COLUMN `metaDescription` TEXT NULL;
ALTER TABLE `HomePost` MODIFY COLUMN `metaKeywords` TEXT NULL;
