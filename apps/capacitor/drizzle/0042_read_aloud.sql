ALTER TABLE `settings` ADD `tts_wpm` integer DEFAULT 180 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `tts_pitch` real DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `tts_rewind_words` integer DEFAULT 8 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `tts_voices` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `tts_follow` integer DEFAULT true NOT NULL;
