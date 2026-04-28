CREATE TABLE IF NOT EXISTS `series` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`cover_image` text,
	`description` text,
	`source_url` text NOT NULL,
	`toc_url` text NOT NULL,
	`provider` text NOT NULL,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `series_provider_check` CHECK (`provider` IN ('ao3', 'scribblehub', 'royalroad', 'ffnet', 'wuxiaworld', 'rss'))
);
--> statement-breakpoint
ALTER TABLE `books` ADD `series_id` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `chapter_index` integer;
--> statement-breakpoint
ALTER TABLE `books` ADD `chapter_source_url` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `chapter_status` text DEFAULT 'fetched' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_books_series_chapter` ON `books` (`series_id`, `chapter_index`) WHERE `series_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `series_deleted_idx` ON `series` (`deleted`);
