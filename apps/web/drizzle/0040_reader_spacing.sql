ALTER TABLE "sync_settings" ADD COLUMN "reader_letter_spacing" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD COLUMN "reader_word_spacing" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD COLUMN "reader_paragraph_spacing" real DEFAULT 1.1 NOT NULL;
