-- Tag rules changed (personal names and local places dropped, "--" without
-- spaces split). Clearing tags makes the background backfill on boot
-- re-derive every row from its stored subjects; no upstream fetch.
UPDATE catalog_books SET tags = NULL;
