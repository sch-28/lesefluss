ALTER TABLE `settings` ADD COLUMN `reader_theme` text DEFAULT 'dark' NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `reader_font_size` integer DEFAULT 17 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `reader_font_family` text DEFAULT 'sans' NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `reader_line_spacing` real DEFAULT 1.8 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `reader_margin` integer DEFAULT 20 NOT NULL;
