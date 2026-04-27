CREATE TABLE "sync_glossary_entries" (
	"user_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"book_id" text,
	"label" text NOT NULL,
	"notes" text,
	"color" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_glossary_entries_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
CREATE INDEX "sync_glossary_entries_user_book_idx" ON "sync_glossary_entries" ("user_id","book_id");
