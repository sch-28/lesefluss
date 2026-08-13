-- The reading position needs a revision stamp of its own.
--
-- `updated_at` (added in 0030) moves on any edit, so once metadata is editable a
-- device sitting on a stale position could out-rank a newer position from
-- another device simply by rating a book. Gating the position on its own stamp
-- keeps the two concerns independent.
--
-- Backfilled to the same expression as `updated_at`, which under the pre-0030
-- scheme WAS the position's stamp, so no existing book changes hands.

ALTER TABLE `books` ADD `position_updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

UPDATE `books` SET `position_updated_at` = MAX(COALESCE(`last_read`, 0), `added_at`);
