CREATE TABLE IF NOT EXISTS `smart_shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`conditions` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`sort_order` real NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
