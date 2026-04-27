CREATE TABLE IF NOT EXISTS `glossary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text,
	`label` text NOT NULL,
	`notes` text,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `glossary_entries_book_id_idx` ON `glossary_entries` (`book_id`);
