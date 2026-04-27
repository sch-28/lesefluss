-- Backfill picks the newest changelog date at migration-authoring time so
-- existing users see entries added after this migration ships in the
-- What's New dialog. Do not edit this date after release; raise the floor
-- in a follow-up migration instead.
ALTER TABLE `settings` ADD `last_seen_changelog_date` text DEFAULT '2026-04-23' NOT NULL;
