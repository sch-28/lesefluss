-- Drop legacy byte-offset columns. Word-position columns (added in 0025
-- and populated by the boot-time backfill) are now the only source of truth
-- (ADR-0002). Defensive backfill statements run first so any legacy NULL
-- value gets a sane default before the byte column it shadowed disappears.

-- Defensive backfill: ensure word_position is set when the byte column was.
-- For rows where backfill never ran we lose precision (byte != word) but at
-- least the column is non-zero so the reader resumes near the saved spot
-- rather than restarting at 0.
UPDATE `books`
SET `word_position` = `position`
WHERE `word_position` = 0 AND `position` > 0;
--> statement-breakpoint

-- Highlight word anchors: fall back to byte offsets when NULL (better than
-- losing the highlight). Tokenizer drift may shift the visible range by a
-- word or two; acceptable vs deleting user data.
UPDATE `highlights`
SET `start_word` = COALESCE(`start_word`, `start_offset`),
    `start_char_in_word` = COALESCE(`start_char_in_word`, 0),
    `end_word` = COALESCE(`end_word`, `end_offset`),
    `end_char_in_word` = COALESCE(`end_char_in_word`, 0)
WHERE `start_word` IS NULL OR `end_word` IS NULL;
--> statement-breakpoint

-- Reading sessions same story.
UPDATE `reading_sessions`
SET `start_word` = COALESCE(`start_word`, `start_pos`),
    `end_word` = COALESCE(`end_word`, `end_pos`)
WHERE `start_word` IS NULL OR `end_word` IS NULL;
--> statement-breakpoint

ALTER TABLE `books` DROP COLUMN `position`;
--> statement-breakpoint
ALTER TABLE `books` DROP COLUMN `position_unit`;
--> statement-breakpoint
ALTER TABLE `highlights` DROP COLUMN `start_offset`;
--> statement-breakpoint
ALTER TABLE `highlights` DROP COLUMN `end_offset`;
--> statement-breakpoint
ALTER TABLE `reading_sessions` DROP COLUMN `start_pos`;
--> statement-breakpoint
ALTER TABLE `reading_sessions` DROP COLUMN `end_pos`;
--> statement-breakpoint

-- For each chapter element: set startWord = COALESCE(startWord, startByte, 0)
-- BEFORE stripping startByte, so chapters that never ran the boot-time
-- backfill keep a usable nav anchor (tokenizer drift may shift the position
-- by a word, vs losing chapter navigation entirely). Then drop startByte.
-- Skipped for rows whose chapters JSON is not a well-formed array.
UPDATE `book_content`
SET `chapters` = (
  SELECT json_group_array(
    json_remove(
      json_set(
        value,
        '$.startWord',
        COALESCE(
          json_extract(value, '$.startWord'),
          json_extract(value, '$.startByte'),
          0
        )
      ),
      '$.startByte'
    )
  )
  FROM json_each(`book_content`.`chapters`)
)
WHERE `chapters` IS NOT NULL
  AND json_valid(`chapters`)
  AND json_type(`chapters`) = 'array';
