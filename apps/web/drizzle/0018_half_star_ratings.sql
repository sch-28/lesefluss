-- Ratings now count half-stars, so the range doubles: 1..10 where 7 is three
-- and a half. No data conversion: the column has never shipped, so no row
-- holds a value written under the old whole-star meaning.
ALTER TABLE "sync_books" DROP CONSTRAINT IF EXISTS "sync_books_rating_check";--> statement-breakpoint
ALTER TABLE "sync_books" ADD CONSTRAINT "sync_books_rating_check" CHECK ("sync_books"."rating" IS NULL OR "sync_books"."rating" BETWEEN 1 AND 10) NOT VALID;--> statement-breakpoint
ALTER TABLE "sync_books" VALIDATE CONSTRAINT "sync_books_rating_check";
