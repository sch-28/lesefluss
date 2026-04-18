CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS catalog_books (
	id           text PRIMARY KEY,
	source       text NOT NULL,
	title        text NOT NULL,
	author       text,
	language     text,
	subjects     text[],
	summary      text,
	description  text,
	epub_url     text,
	cover_url    text,
	gutenberg_id text,
	suppressed   boolean NOT NULL DEFAULT false,
	synced_at    timestamptz NOT NULL DEFAULT now(),
	search_vec   tsvector
);

-- Maintain search_vec via trigger.
-- (Can't use a generated column because array_to_string is STABLE, not IMMUTABLE.)
CREATE OR REPLACE FUNCTION catalog_books_search_vec_update() RETURNS trigger AS $$
BEGIN
	NEW.search_vec :=
		to_tsvector('simple',
			coalesce(NEW.title, '') || ' ' ||
			coalesce(NEW.author, '') || ' ' ||
			coalesce(array_to_string(NEW.subjects, ' '), ''));
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_books_search_vec_trg ON catalog_books;
CREATE TRIGGER catalog_books_search_vec_trg
	BEFORE INSERT OR UPDATE OF title, author, subjects ON catalog_books
	FOR EACH ROW EXECUTE FUNCTION catalog_books_search_vec_update();

CREATE INDEX IF NOT EXISTS catalog_books_search_idx ON catalog_books USING GIN (search_vec);
CREATE INDEX IF NOT EXISTS catalog_books_title_trgm  ON catalog_books USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS catalog_books_author_trgm ON catalog_books USING GIN (author gin_trgm_ops);
CREATE INDEX IF NOT EXISTS catalog_books_suppressed  ON catalog_books (suppressed);
CREATE INDEX IF NOT EXISTS catalog_books_language    ON catalog_books (language);
