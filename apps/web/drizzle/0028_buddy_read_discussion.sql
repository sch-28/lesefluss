ALTER TABLE "buddy_read_member" ADD COLUMN "furthest_word" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "buddy_read_member" ADD COLUMN "share_all_highlights" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "buddy_read_member" ADD COLUMN "show_everything" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "buddy_read_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buddy_read_id" uuid NOT NULL,
	"kind" text DEFAULT 'comment' NOT NULL,
	"author_id" text,
	"parent_id" uuid,
	"anchor_kind" text NOT NULL,
	"start_word" integer NOT NULL,
	"start_char_in_word" integer DEFAULT 0 NOT NULL,
	"end_word" integer NOT NULL,
	"end_char_in_word" integer DEFAULT 0 NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "buddy_read_comment" ADD CONSTRAINT "buddy_read_comment_buddy_read_id_buddy_read_id_fk" FOREIGN KEY ("buddy_read_id") REFERENCES "public"."buddy_read"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_comment" ADD CONSTRAINT "buddy_read_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_comment" ADD CONSTRAINT "buddy_read_comment_parent_id_buddy_read_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."buddy_read_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buddy_read_comment_read_idx" ON "buddy_read_comment" USING btree ("buddy_read_id","start_word");--> statement-breakpoint
CREATE INDEX "buddy_read_comment_author_idx" ON "buddy_read_comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "buddy_read_comment_parent_idx" ON "buddy_read_comment" USING btree ("parent_id");--> statement-breakpoint
CREATE TABLE "buddy_read_shared_highlight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buddy_read_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"highlight_id" text NOT NULL,
	"shared_individually" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "buddy_read_shared_highlight" ADD CONSTRAINT "buddy_read_shared_highlight_buddy_read_id_buddy_read_id_fk" FOREIGN KEY ("buddy_read_id") REFERENCES "public"."buddy_read"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_shared_highlight" ADD CONSTRAINT "buddy_read_shared_highlight_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buddy_read_shared_highlight_idx" ON "buddy_read_shared_highlight" USING btree ("buddy_read_id","user_id","highlight_id");--> statement-breakpoint
CREATE TABLE "buddy_read_reaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buddy_read_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"comment_id" uuid,
	"shared_highlight_id" uuid,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "buddy_read_reaction_one_target" CHECK (("buddy_read_reaction"."comment_id" IS NULL) <> ("buddy_read_reaction"."shared_highlight_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "buddy_read_reaction" ADD CONSTRAINT "buddy_read_reaction_buddy_read_id_buddy_read_id_fk" FOREIGN KEY ("buddy_read_id") REFERENCES "public"."buddy_read"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_reaction" ADD CONSTRAINT "buddy_read_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_reaction" ADD CONSTRAINT "buddy_read_reaction_comment_id_buddy_read_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."buddy_read_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_reaction" ADD CONSTRAINT "buddy_read_reaction_shared_highlight_id_buddy_read_shared_highlight_id_fk" FOREIGN KEY ("shared_highlight_id") REFERENCES "public"."buddy_read_shared_highlight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buddy_read_reaction_comment_idx" ON "buddy_read_reaction" USING btree ("comment_id","user_id","emoji") WHERE "buddy_read_reaction"."comment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "buddy_read_reaction_highlight_idx" ON "buddy_read_reaction" USING btree ("shared_highlight_id","user_id","emoji") WHERE "buddy_read_reaction"."shared_highlight_id" IS NOT NULL;
