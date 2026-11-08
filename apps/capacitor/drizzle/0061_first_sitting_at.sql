-- A book is Reading after its first real sitting (60s of active reading), not
-- after any saved position.
--
-- Backfill, once: the earliest written session of a minute or more. A book with
-- a position but no session at all was read before sessions were tracked or on
-- the ESP32 (which records none), so it keeps its Reading shelf, dated to its
-- last read. A book whose only sessions are short skims stays unstarted.

ALTER TABLE `books` ADD COLUMN `first_sitting_at` integer;
--> statement-breakpoint

UPDATE `books` SET `first_sitting_at` = COALESCE(
	(SELECT MIN(`started_at`) FROM `reading_sessions`
		WHERE `reading_sessions`.`book_id` = `books`.`id` AND `duration_ms` >= 60000),
	CASE WHEN `word_position` > 0 AND NOT EXISTS (
		SELECT 1 FROM `reading_sessions` WHERE `reading_sessions`.`book_id` = `books`.`id`
	) THEN COALESCE(`last_read`, `added_at`) END
) WHERE `first_sitting_at` IS NULL;
