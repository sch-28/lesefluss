-- NOTE: `size` already exists in 0000_slippery_rhino.sql. This migration is a
-- no-op on fresh installs because the migration runner in db/index.ts checks
-- PRAGMA table_info before running ADD COLUMN statements. Kept for journal
-- compatibility with devices that already applied it.
ALTER TABLE `books` ADD COLUMN `size` integer DEFAULT 0 NOT NULL;
