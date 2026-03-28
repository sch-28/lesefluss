CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_connected` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`wpm` integer DEFAULT 350 NOT NULL,
	`delay_comma` real DEFAULT 2 NOT NULL,
	`delay_period` real DEFAULT 3 NOT NULL,
	`accel_start` real DEFAULT 2 NOT NULL,
	`accel_rate` real DEFAULT 0.1 NOT NULL,
	`x_offset` integer DEFAULT 50 NOT NULL,
	`word_offset` integer DEFAULT 5 NOT NULL,
	`inverse` integer DEFAULT false NOT NULL,
	`ble_on` integer DEFAULT true NOT NULL,
	`dev_mode` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`file_format` text DEFAULT 'txt' NOT NULL,
	`file_path` text,
	`size` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`added_at` integer NOT NULL,
	`last_read` integer
);
--> statement-breakpoint
CREATE TABLE `book_content` (
	`book_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`cover_image` text,
	`chapters` text
);
