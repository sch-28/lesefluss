-- Reader-editable book metadata, plus the `updated_at` column the sync merge
-- needs to see an edit at all.
--
-- Until now sync derived a book's timestamp as MAX(last_read, added_at), so a
-- title change that moved no reading position was invisible to last-write-wins.
-- The backfill below reproduces exactly that expression, so every existing book
-- keeps the timestamp the server already knows and nothing re-syncs.

ALTER TABLE `books` ADD `updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

UPDATE `books` SET `updated_at` = MAX(COALESCE(`last_read`, 0), `added_at`);
--> statement-breakpoint

ALTER TABLE `books` ADD `description` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `language` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `status` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `rating` integer;
--> statement-breakpoint
ALTER TABLE `books` ADD `review` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `tags` text;
