-- Tombstones written before deletes cleared them still hold the reading. Their
-- updated_at stays, so pulls do not list them again.
UPDATE "sync_reading_sessions" SET
	"book_id" = '', "mode" = 'scroll', "started_at" = to_timestamp(0) AT TIME ZONE 'UTC',
	"ended_at" = to_timestamp(0) AT TIME ZONE 'UTC', "duration_ms" = 0, "words_read" = 0,
	"start_word" = 0, "end_word" = 0, "furthest_word" = NULL, "wpm_avg" = NULL,
	"font_size" = NULL, "segment_wpm" = NULL
WHERE "deleted";--> statement-breakpoint
UPDATE "sync_speed_tests" SET
	"reading_wpm" = 1, "rsvp_wpm" = NULL, "passage_id" = 'wiped',
	"created_at" = to_timestamp(0) AT TIME ZONE 'UTC'
WHERE "deleted";
