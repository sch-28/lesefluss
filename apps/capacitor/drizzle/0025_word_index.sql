ALTER TABLE `books` ADD `word_position` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `books` ADD `position_unit` text DEFAULT 'byte' NOT NULL;
--> statement-breakpoint
ALTER TABLE `book_content` ADD `word_index` blob;
--> statement-breakpoint
ALTER TABLE `highlights` ADD `start_word` integer;
--> statement-breakpoint
ALTER TABLE `highlights` ADD `start_char_in_word` integer;
--> statement-breakpoint
ALTER TABLE `highlights` ADD `end_word` integer;
--> statement-breakpoint
ALTER TABLE `highlights` ADD `end_char_in_word` integer;
--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `start_word` integer;
--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `end_word` integer;
