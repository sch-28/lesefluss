ALTER TABLE "sync_books" ADD COLUMN "first_sitting_at" timestamp;--> statement-breakpoint
-- Backfill: the earliest synced sitting of 60 s or more; a book read before
-- sessions were recorded (a position but no session at all) keeps Reading from
-- its position revision. A book with only short sessions stays unmarked.
UPDATE "sync_books" b SET "first_sitting_at" = COALESCE(
	(SELECT MIN(s."started_at") FROM "sync_reading_sessions" s
		WHERE s."user_id" = b."user_id" AND s."book_id" = b."book_id"
			AND NOT s."deleted" AND s."duration_ms" >= 60000),
	CASE WHEN b."word_position" > 0 AND NOT EXISTS (
		SELECT 1 FROM "sync_reading_sessions" s
		WHERE s."user_id" = b."user_id" AND s."book_id" = b."book_id" AND NOT s."deleted"
	) THEN b."updated_at" END
) WHERE b."first_sitting_at" IS NULL;
