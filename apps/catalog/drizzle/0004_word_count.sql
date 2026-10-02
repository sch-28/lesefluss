ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS word_count integer;
-- The epub_url the count was taken from. A changed URL means a new edition, so it is counted again.
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS word_count_epub_url text;
-- Last failed attempt; the crawler waits before retrying so a dead link is not hit every pass.
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS word_count_failed_at timestamptz;

CREATE INDEX IF NOT EXISTS catalog_books_word_count ON catalog_books (word_count);
