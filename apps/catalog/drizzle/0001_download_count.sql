ALTER TABLE catalog_books ADD COLUMN IF NOT EXISTS download_count integer;

CREATE INDEX IF NOT EXISTS idx_catalog_books_download_count
	ON catalog_books (download_count DESC NULLS LAST);
