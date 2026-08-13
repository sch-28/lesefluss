ALTER TABLE "sync_books" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "review" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "tags" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD CONSTRAINT "sync_books_status_check" CHECK ("sync_books"."status" IS NULL OR "sync_books"."status" IN ('want', 'reading', 'finished', 'dropped')) NOT VALID;--> statement-breakpoint
ALTER TABLE "sync_books" ADD CONSTRAINT "sync_books_rating_check" CHECK ("sync_books"."rating" IS NULL OR "sync_books"."rating" BETWEEN 1 AND 5) NOT VALID;--> statement-breakpoint
ALTER TABLE "sync_books" VALIDATE CONSTRAINT "sync_books_status_check";--> statement-breakpoint
ALTER TABLE "sync_books" VALIDATE CONSTRAINT "sync_books_rating_check";
