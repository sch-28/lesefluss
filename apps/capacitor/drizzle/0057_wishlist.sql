CREATE TABLE IF NOT EXISTS `wishlist` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`cover_url` text,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wishlist_ref_idx` ON `wishlist` (`ref`);
