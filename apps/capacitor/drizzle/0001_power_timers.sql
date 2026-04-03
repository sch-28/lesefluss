ALTER TABLE `settings` ADD COLUMN `display_off_timeout` integer DEFAULT 60 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `deep_sleep_timeout` integer DEFAULT 120 NOT NULL;
