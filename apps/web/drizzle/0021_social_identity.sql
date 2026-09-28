CREATE TABLE "social_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text,
	"handle_changed_at" timestamp,
	"bio" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"show_currently_reading" boolean DEFAULT true NOT NULL,
	"show_finished" boolean DEFAULT true NOT NULL,
	"show_stats" boolean DEFAULT true NOT NULL,
	"show_highlights" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_profile_visibility_check" CHECK ("social_profile"."visibility" IN ('private', 'friends'))
);
--> statement-breakpoint
CREATE TABLE "social_handle" (
	"handle" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp,
	"reclaimable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_avatar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_avatar_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "social_profile" ADD CONSTRAINT "social_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_handle" ADD CONSTRAINT "social_handle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_avatar" ADD CONSTRAINT "social_avatar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_handle_user_id_idx" ON "social_handle" USING btree ("user_id");
