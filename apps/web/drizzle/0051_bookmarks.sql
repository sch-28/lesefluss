CREATE TABLE "sync_bookmarks" (
	"user_id" text NOT NULL,
	"bookmark_id" text NOT NULL,
	"book_id" text NOT NULL,
	"word" integer NOT NULL,
	"label" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_bookmarks_user_id_bookmark_id_pk" PRIMARY KEY("user_id","bookmark_id")
);
