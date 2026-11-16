CREATE TABLE "sync_collections" (
	"user_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" double precision NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_collections_user_id_collection_id_pk" PRIMARY KEY("user_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "sync_collection_books" (
	"user_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"book_id" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_collection_books_user_id_collection_id_book_id_pk" PRIMARY KEY("user_id","collection_id","book_id")
);
