-- Gutenberg rows without an EPUB can't be opened in the app ("Not available as
-- free EPUB"): audio books left over from the Gutendex sync, plus texts PG only
-- ships as PDF/LaTeX or plain text. Hidden, not deleted, so it stays reversible.
-- Only ever sets true: `suppressed` is also the SE-dedup and manual takedown flag.
UPDATE catalog_books
SET suppressed = true
WHERE source = 'gutenberg' AND epub_url IS NULL AND suppressed = false;
