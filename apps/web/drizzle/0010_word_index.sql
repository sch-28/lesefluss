ALTER TABLE "sync_books" ADD COLUMN "word_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "position_unit" text DEFAULT 'byte' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_highlights" ADD COLUMN "start_word" integer;--> statement-breakpoint
ALTER TABLE "sync_highlights" ADD COLUMN "start_char_in_word" integer;--> statement-breakpoint
ALTER TABLE "sync_highlights" ADD COLUMN "end_word" integer;--> statement-breakpoint
ALTER TABLE "sync_highlights" ADD COLUMN "end_char_in_word" integer;--> statement-breakpoint
ALTER TABLE "sync_reading_sessions" ADD COLUMN "start_word" integer;--> statement-breakpoint
ALTER TABLE "sync_reading_sessions" ADD COLUMN "end_word" integer;
