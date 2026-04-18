ALTER TABLE `books` ADD `source` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `catalog_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_books_catalog_id` ON `books` (`catalog_id`);
