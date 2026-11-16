CREATE TABLE IF NOT EXISTS `speed_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`reading_wpm` integer NOT NULL,
	`rsvp_wpm` integer,
	`passage_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
