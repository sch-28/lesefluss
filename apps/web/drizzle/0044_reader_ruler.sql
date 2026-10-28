ALTER TABLE "sync_settings" ADD COLUMN "reader_ruler" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD COLUMN "reader_ruler_lines" integer DEFAULT 1 NOT NULL;