-- Stop storing chapter body content server-side. Web-novel chapter rows
-- (sync_books.series_id IS NOT NULL) are re-derivable from the upstream provider
-- via the reader's chapter-fetch path; persisting their content/cover/TOC blew up
-- sync_books for users with large serial libraries.
--
-- chapter_status is reset to 'pending' for any row whose content we just nulled
-- so that the capacitor reader will refetch on open.

UPDATE "sync_books"
SET
  "content" = NULL,
  "cover_image" = NULL,
  "chapters" = NULL,
  "chapter_status" = 'pending'
WHERE "series_id" IS NOT NULL
  AND ("content" IS NOT NULL OR "cover_image" IS NOT NULL OR "chapters" IS NOT NULL);
