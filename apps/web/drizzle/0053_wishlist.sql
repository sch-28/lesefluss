CREATE TABLE "sync_wishlist" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"cover_url" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_wishlist_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
