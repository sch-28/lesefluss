-- Words estimated from the size of Gutenberg's plain-text edition, filled by
-- the next sync. Shown until the crawler's exact word_count arrives.
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS word_count_estimate integer;

-- Length filters and the length sort read the exact count, else the estimate.
CREATE INDEX IF NOT EXISTS catalog_books_effective_words
	ON catalog_books ((COALESCE(word_count, word_count_estimate)));
