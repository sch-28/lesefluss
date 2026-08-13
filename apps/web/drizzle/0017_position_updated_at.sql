ALTER TABLE "sync_books" ADD COLUMN "position_updated_at" timestamp;--> statement-breakpoint
UPDATE "sync_books" SET "position_updated_at" = "updated_at" WHERE "position_updated_at" IS NULL;
