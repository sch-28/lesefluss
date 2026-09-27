CREATE TABLE "social_friendship" (
	"user_low" text NOT NULL,
	"user_high" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_friendship_user_low_user_high_pk" PRIMARY KEY("user_low","user_high"),
	CONSTRAINT "social_friendship_order_check" CHECK ("social_friendship"."user_low" < "social_friendship"."user_high")
);
--> statement-breakpoint
CREATE TABLE "social_friend_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "social_friend_request_self_check" CHECK ("social_friend_request"."requester_id" <> "social_friend_request"."addressee_id")
);
--> statement-breakpoint
CREATE TABLE "social_block" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_block_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "social_invite" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "social_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "social_friendship" ADD CONSTRAINT "social_friendship_user_low_user_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friendship" ADD CONSTRAINT "social_friendship_user_high_user_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friend_request" ADD CONSTRAINT "social_friend_request_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friend_request" ADD CONSTRAINT "social_friend_request_addressee_id_user_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_block" ADD CONSTRAINT "social_block_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_block" ADD CONSTRAINT "social_block_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_invite" ADD CONSTRAINT "social_invite_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_friendship_user_high_idx" ON "social_friendship" USING btree ("user_high");--> statement-breakpoint
CREATE UNIQUE INDEX "social_friend_request_pair_idx" ON "social_friend_request" USING btree ("requester_id","addressee_id");--> statement-breakpoint
CREATE INDEX "social_friend_request_addressee_idx" ON "social_friend_request" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "social_block_blocked_idx" ON "social_block" USING btree ("blocked_id");
