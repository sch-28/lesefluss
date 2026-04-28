CREATE TABLE "sync_series" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"cover_image" text,
	"description" text,
	"source_url" text NOT NULL,
	"toc_url" text NOT NULL,
	"provider" text NOT NULL,
	"last_checked_at" timestamp,
	"created_at" timestamp NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_series_user_id_series_id_pk" PRIMARY KEY("user_id","series_id"),
	CONSTRAINT "sync_series_provider_check" CHECK ("provider" IN ('ao3', 'scribblehub', 'royalroad', 'ffnet', 'wuxiaworld', 'rss'))
);
--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "series_id" text;
--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "chapter_index" integer;
--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "chapter_source_url" text;
--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "chapter_status" text DEFAULT 'fetched' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sync_books" ADD CONSTRAINT "sync_books_chapter_status_check" CHECK ("chapter_status" IN ('pending', 'fetched', 'locked', 'error'));
--> statement-breakpoint
CREATE INDEX "sync_books_series_idx" ON "sync_books" ("user_id","series_id");
