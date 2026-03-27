-- Replace the slot (integer, nullable) column with isActive (boolean).
-- Single active book model: at most one row has is_active = 1 at a time.
-- Uses table-recreation pattern (SQLite < 3.35 doesn't support DROP COLUMN).

-- 1. Create new books table with is_active instead of slot
CREATE TABLE `books_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`file_format` text NOT NULL DEFAULT 'txt',
	`file_path` text,
	`size` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_active` integer NOT NULL DEFAULT 0,
	`added_at` integer NOT NULL,
	`last_read` integer
);
--> statement-breakpoint
-- 2. Copy existing rows; no book is active by default after migration
INSERT INTO `books_new` (`id`, `title`, `author`, `file_format`, `file_path`, `size`, `position`, `is_active`, `added_at`, `last_read`)
SELECT `id`, `title`, `author`, `file_format`, `file_path`, `size`, `position`, 0, `added_at`, `last_read` FROM `books`;
--> statement-breakpoint
-- 3. Drop old table
DROP TABLE `books`;
--> statement-breakpoint
-- 4. Rename new table
ALTER TABLE `books_new` RENAME TO `books`;
