CREATE TABLE "sync_smart_shelves" (
	"user_id" text NOT NULL,
	"shelf_id" text NOT NULL,
	"name" text NOT NULL,
	"conditions" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"sort_order" double precision NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_smart_shelves_user_id_shelf_id_pk" PRIMARY KEY("user_id","shelf_id")
);
