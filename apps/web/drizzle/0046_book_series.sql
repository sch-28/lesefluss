ALTER TABLE "sync_books" ADD COLUMN "series_name" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "series_index" double precision;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "series_updated_at" timestamp;
