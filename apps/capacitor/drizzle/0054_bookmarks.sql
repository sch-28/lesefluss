CREATE TABLE IF NOT EXISTS `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`word` integer NOT NULL,
	`label` text,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmarks_book_idx` ON `bookmarks` (`book_id`);
