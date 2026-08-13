-- Corrects the split introduced by 0030/0031.
--
-- Every released build reads `updated_at` as the READING POSITION's revision:
-- it derives it as MAX(last_read, added_at) on push, and on pull adopts the
-- server's position whenever the server's `updated_at` is higher. Making it a
-- general row revision that metadata edits move would make those builds discard
-- unpushed reading the first time a newer device rated a book.
--
-- So `updated_at` keeps its released meaning and the NEW concern gets the new
-- column: `metadata_updated_at` carries description/language/status/rating/
-- review/tags. `position_updated_at` (0031) is dropped, unused.
--
-- Seeded from `updated_at` so the first metadata merge has a revision to compare
-- against rather than treating every row as edited at epoch 0.

ALTER TABLE `books` ADD `metadata_updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

UPDATE `books` SET `metadata_updated_at` = `updated_at`;
--> statement-breakpoint

ALTER TABLE `books` DROP COLUMN `position_updated_at`;
