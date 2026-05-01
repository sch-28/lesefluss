CREATE TABLE "sync_reading_sessions" (
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"book_id" text NOT NULL,
	"mode" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"duration_ms" integer NOT NULL,
	"words_read" integer NOT NULL,
	"start_pos" integer NOT NULL,
	"end_pos" integer NOT NULL,
	"wpm_avg" integer,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_reading_sessions_user_id_session_id_pk" PRIMARY KEY("user_id","session_id"),
	CONSTRAINT "sync_reading_sessions_mode_check" CHECK ("mode" IN ('rsvp', 'scroll', 'page'))
);
--> statement-breakpoint
CREATE INDEX "sync_reading_sessions_book_idx" ON "sync_reading_sessions" ("user_id","book_id");
--> statement-breakpoint
CREATE INDEX "sync_reading_sessions_started_idx" ON "sync_reading_sessions" ("user_id","started_at");
