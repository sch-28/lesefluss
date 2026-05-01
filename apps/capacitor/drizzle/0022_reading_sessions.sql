CREATE TABLE IF NOT EXISTS `reading_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`mode` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`words_read` integer NOT NULL,
	`start_pos` integer NOT NULL,
	`end_pos` integer NOT NULL,
	`wpm_avg` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reading_sessions_book_id_idx` ON `reading_sessions` (`book_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reading_sessions_started_at_idx` ON `reading_sessions` (`started_at`);
