-- Recovery migration: handle the torn-state case where migration 0003 ran
-- CREATE TABLE books_new + INSERT but then failed before DROP/RENAME.
-- In that state: books_new exists, books does not → finish the rename.
--
-- If books already exists (normal case), this statement will fail with
-- "no such table: books_new" and the runner's RENAME guard will skip it.
ALTER TABLE `books_new` RENAME TO `books`;
