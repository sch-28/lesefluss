CREATE TABLE IF NOT EXISTS `book_images` (
	`book_id` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer DEFAULT 0 NOT NULL,
	`height` integer DEFAULT 0 NOT NULL,
	`is_line_art` integer DEFAULT false NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`book_id`, `key`)
);
--> statement-breakpoint
ALTER TABLE `book_content` ADD `image_anchors` text;
