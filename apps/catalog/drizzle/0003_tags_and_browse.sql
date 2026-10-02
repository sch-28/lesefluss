ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS bookshelves text[];
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS author_birth_year integer;
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS author_death_year integer;
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS author_keys text[];

-- Existing rows have no real insert time; synced_at is the closest signal and
-- keeps the "recently added" sort stable instead of tying every old row at now().
ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS added_at timestamptz;
UPDATE catalog_books SET added_at = synced_at WHERE added_at IS NULL;
ALTER TABLE catalog_books ALTER COLUMN added_at SET DEFAULT now();
ALTER TABLE catalog_books ALTER COLUMN added_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_books_tags_idx ON catalog_books USING GIN (tags);
CREATE INDEX IF NOT EXISTS catalog_books_author_keys_idx ON catalog_books USING GIN (author_keys);
CREATE INDEX IF NOT EXISTS catalog_books_added_at ON catalog_books (added_at DESC);

CREATE TABLE IF NOT EXISTS catalog_tags (
	id    text PRIMARY KEY,
	label text NOT NULL
);
