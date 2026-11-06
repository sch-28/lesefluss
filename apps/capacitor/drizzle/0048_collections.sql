CREATE TABLE IF NOT EXISTS `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` real NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collection_books` (
	`collection_id` text NOT NULL,
	`book_id` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `book_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collection_books_book_idx` ON `collection_books` (`book_id`);
