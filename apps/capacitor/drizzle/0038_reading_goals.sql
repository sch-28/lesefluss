CREATE TABLE IF NOT EXISTS `reading_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`start_word` integer NOT NULL,
	`plan_start_date` text NOT NULL,
	`plan_start_word` integer NOT NULL,
	`target_date` text NOT NULL,
	`daily_percent` real NOT NULL,
	`carried_days_met` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `reading_goals_mode_check` CHECK(`mode` IN ('deadline', 'pace')),
	CONSTRAINT `reading_goals_status_check` CHECK(`status` IN ('active', 'completed', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reading_goals_book_idx` ON `reading_goals` (`book_id`);
