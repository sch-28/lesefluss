ALTER TABLE `books` ADD `series_name` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `series_index` real;
--> statement-breakpoint
ALTER TABLE `books` ADD `series_updated_at` integer DEFAULT 0 NOT NULL;
