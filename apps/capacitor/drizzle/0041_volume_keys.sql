ALTER TABLE `settings` ADD `volume_key_page_turn` integer;
--> statement-breakpoint
ALTER TABLE `settings` ADD `volume_key_invert` integer DEFAULT false NOT NULL;
