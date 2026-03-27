-- Split books table: metadata stays in `books`, large data moves to `book_content`.
-- Uses table-recreation pattern because SQLite < 3.35 doesn't support DROP COLUMN.
-- Foreign keys are not enforced at runtime (PRAGMA foreign_keys is OFF), so
-- referential integrity is maintained by the app's query layer.

-- 1. Create new books table (metadata only)
CREATE TABLE `books_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`file_format` text NOT NULL DEFAULT 'txt',
	`file_path` text,
	`size` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`slot` integer,
	`added_at` integer NOT NULL,
	`last_read` integer
);
--> statement-breakpoint
-- 2. Copy existing metadata (default file_format to 'txt' for legacy rows)
INSERT INTO `books_new` (`id`, `title`, `author`, `file_format`, `file_path`, `size`, `position`, `slot`, `added_at`, `last_read`)
SELECT `id`, `title`, `author`, 'txt', NULL, `size`, `position`, `slot`, `added_at`, `last_read` FROM `books`;
--> statement-breakpoint
-- 3. Create book_content table for large data
CREATE TABLE `book_content` (
	`book_id` integer PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`cover_image` text,
	`chapters` text
);
--> statement-breakpoint
-- 4. Move content from old books into book_content
INSERT INTO `book_content` (`book_id`, `content`)
SELECT `id`, `content` FROM `books`;
--> statement-breakpoint
-- 5. Drop old table
DROP TABLE `books`;
--> statement-breakpoint
-- 6. Rename new table
ALTER TABLE `books_new` RENAME TO `books`;
