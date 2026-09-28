CREATE TABLE "buddy_read" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_user_id" text NOT NULL,
	"origin_book_id" text NOT NULL,
	"host_id" text,
	"title" text NOT NULL,
	"author" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"target_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "buddy_read" ADD CONSTRAINT "buddy_read_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buddy_read_origin_idx" ON "buddy_read" USING btree ("origin_user_id","origin_book_id");--> statement-breakpoint
CREATE TABLE "buddy_read_member" (
	"buddy_read_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"finish_armed" boolean DEFAULT false NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "buddy_read_member_buddy_read_id_user_id_pk" PRIMARY KEY("buddy_read_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "buddy_read_member" ADD CONSTRAINT "buddy_read_member_buddy_read_id_buddy_read_id_fk" FOREIGN KEY ("buddy_read_id") REFERENCES "public"."buddy_read"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_member" ADD CONSTRAINT "buddy_read_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buddy_read_member_user_idx" ON "buddy_read_member" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "buddy_read_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buddy_read_id" uuid NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "buddy_read_invite" ADD CONSTRAINT "buddy_read_invite_buddy_read_id_buddy_read_id_fk" FOREIGN KEY ("buddy_read_id") REFERENCES "public"."buddy_read"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_invite" ADD CONSTRAINT "buddy_read_invite_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_read_invite" ADD CONSTRAINT "buddy_read_invite_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buddy_read_invite_invitee_idx" ON "buddy_read_invite" USING btree ("invitee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "buddy_read_invite_pending_idx" ON "buddy_read_invite" USING btree ("buddy_read_id","invitee_id") WHERE "buddy_read_invite"."status" = 'pending';
