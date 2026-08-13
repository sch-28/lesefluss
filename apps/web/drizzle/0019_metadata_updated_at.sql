ALTER TABLE "sync_books" ADD COLUMN "metadata_updated_at" timestamp;--> statement-breakpoint
UPDATE "sync_books" SET "metadata_updated_at" = "updated_at" WHERE "metadata_updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "sync_books" DROP COLUMN IF EXISTS "position_updated_at";
