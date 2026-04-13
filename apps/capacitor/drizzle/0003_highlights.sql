CREATE TABLE IF NOT EXISTS `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
