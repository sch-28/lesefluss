ALTER TABLE "sync_books" ADD COLUMN "origin_user_id" text;--> statement-breakpoint
ALTER TABLE "sync_books" ADD COLUMN "origin_book_id" text;--> statement-breakpoint
UPDATE "sync_books" SET "origin_user_id" = "user_id", "origin_book_id" = "book_id" WHERE "origin_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sync_books" ALTER COLUMN "origin_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_books" ALTER COLUMN "origin_book_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_books_origin_idx" ON "sync_books" USING btree ("origin_user_id","origin_book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_books_user_origin_live_idx" ON "sync_books" USING btree ("user_id","origin_user_id","origin_book_id") WHERE NOT "sync_books"."deleted";--> statement-breakpoint
CREATE TABLE "sync_book_copy" (
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"origin_user_id" text NOT NULL,
	"origin_book_id" text NOT NULL,
	"via" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sync_book_copy_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "sync_book_copy" ADD CONSTRAINT "sync_book_copy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "social_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"book_id" text NOT NULL,
	"origin_user_id" text NOT NULL,
	"origin_book_id" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"word_count" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"copy_book_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "social_share" ADD CONSTRAINT "social_share_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_share" ADD CONSTRAINT "social_share_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_share_recipient_status_idx" ON "social_share" USING btree ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "social_share_sender_created_idx" ON "social_share" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_share_pending_idx" ON "social_share" USING btree ("sender_id","recipient_id","origin_user_id","origin_book_id") WHERE "social_share"."status" = 'pending';--> statement-breakpoint
CREATE TABLE "social_share_consent" (
	"user_id" text PRIMARY KEY NOT NULL,
	"confirmed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_share_consent" ADD CONSTRAINT "social_share_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
