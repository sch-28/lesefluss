ALTER TABLE `settings` ADD `sync_highlights` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `sync_glossary` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `sync_stats` integer DEFAULT true NOT NULL;
