-- Drop legacy byte-offset columns. Defensive backfill copies any NULL word
-- values from the byte columns before the byte columns disappear and before
-- the NOT NULL constraint locks the schema down. Tokenizer drift may shift
-- the resulting anchors by a word or two; better than failing the migration
-- or losing the row entirely.

UPDATE "sync_books" SET "word_position" = "position" WHERE "word_position" = 0 AND "position" > 0;

UPDATE "sync_highlights"
SET "start_word" = COALESCE("start_word", "start_offset"),
    "start_char_in_word" = COALESCE("start_char_in_word", 0),
    "end_word" = COALESCE("end_word", "end_offset"),
    "end_char_in_word" = COALESCE("end_char_in_word", 0)
WHERE "start_word" IS NULL OR "end_word" IS NULL
   OR "start_char_in_word" IS NULL OR "end_char_in_word" IS NULL;

UPDATE "sync_reading_sessions"
SET "start_word" = COALESCE("start_word", "start_pos"),
    "end_word" = COALESCE("end_word", "end_pos")
WHERE "start_word" IS NULL OR "end_word" IS NULL;

ALTER TABLE "sync_books" DROP CONSTRAINT IF EXISTS "sync_books_position_unit_check";
ALTER TABLE "sync_books" DROP COLUMN IF EXISTS "position";
ALTER TABLE "sync_books" DROP COLUMN IF EXISTS "position_unit";

ALTER TABLE "sync_highlights" DROP COLUMN IF EXISTS "start_offset";
ALTER TABLE "sync_highlights" DROP COLUMN IF EXISTS "end_offset";
ALTER TABLE "sync_highlights" ALTER COLUMN "start_word" SET NOT NULL;
ALTER TABLE "sync_highlights" ALTER COLUMN "start_char_in_word" SET NOT NULL;
ALTER TABLE "sync_highlights" ALTER COLUMN "start_char_in_word" SET DEFAULT 0;
ALTER TABLE "sync_highlights" ALTER COLUMN "end_word" SET NOT NULL;
ALTER TABLE "sync_highlights" ALTER COLUMN "end_char_in_word" SET NOT NULL;
ALTER TABLE "sync_highlights" ALTER COLUMN "end_char_in_word" SET DEFAULT 0;

ALTER TABLE "sync_reading_sessions" DROP COLUMN IF EXISTS "start_pos";
ALTER TABLE "sync_reading_sessions" DROP COLUMN IF EXISTS "end_pos";
ALTER TABLE "sync_reading_sessions" ALTER COLUMN "start_word" SET NOT NULL;
ALTER TABLE "sync_reading_sessions" ALTER COLUMN "end_word" SET NOT NULL;

-- For each chapter: set startWord = COALESCE(startWord, startByte, 0) before
-- stripping startByte, so chapters never backfilled client-side keep a
-- usable nav anchor. The column is TEXT (JSON string); NULLIF + jsonb_typeof
-- guard so a malformed row doesn't abort the whole migration.
UPDATE "sync_books"
SET "chapters" = (
  SELECT COALESCE(
    jsonb_agg(
      (
        elem
        || jsonb_build_object(
          'startWord',
          COALESCE(elem -> 'startWord', elem -> 'startByte', '0'::jsonb)
        )
      ) - 'startByte'
    )::text,
    '[]'
  )
  FROM jsonb_array_elements(NULLIF("chapters", '')::jsonb) AS elem
)
WHERE "chapters" IS NOT NULL
  AND NULLIF("chapters", '') IS NOT NULL
  AND jsonb_typeof(NULLIF("chapters", '')::jsonb) = 'array';
