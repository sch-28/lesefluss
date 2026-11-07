ALTER TABLE "sync_collections" ADD COLUMN "ordered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_collections" ADD COLUMN "series_key" text;--> statement-breakpoint
ALTER TABLE "sync_collection_books" ADD COLUMN "series_index" double precision;--> statement-breakpoint
ALTER TABLE "sync_collection_books" ADD COLUMN "position" double precision;
