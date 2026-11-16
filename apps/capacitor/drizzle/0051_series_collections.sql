ALTER TABLE `collections` ADD `ordered` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `series_key` text;--> statement-breakpoint
ALTER TABLE `collection_books` ADD `series_index` real;--> statement-breakpoint
ALTER TABLE `collection_books` ADD `position` real;
