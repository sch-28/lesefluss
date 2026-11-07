CREATE TABLE "sync_speed_tests" (
	"user_id" text NOT NULL,
	"test_id" text NOT NULL,
	"reading_wpm" integer NOT NULL,
	"rsvp_wpm" integer,
	"passage_id" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_speed_tests_user_id_test_id_pk" PRIMARY KEY("user_id","test_id")
);
