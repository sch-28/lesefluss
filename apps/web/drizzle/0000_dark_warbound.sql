CREATE TABLE "sync_books" (
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"file_size" integer,
	"word_count" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"content" text,
	"cover_image" text,
	"chapters" text,
	"source" text,
	"catalog_id" text,
	"source_url" text,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_books_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "sync_highlights" (
	"user_id" text NOT NULL,
	"highlight_id" text NOT NULL,
	"book_id" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"note" text,
	"text" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_highlights_user_id_highlight_id_pk" PRIMARY KEY("user_id","highlight_id")
);
--> statement-breakpoint
CREATE TABLE "sync_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"wpm" integer DEFAULT 350 NOT NULL,
	"delay_comma" real DEFAULT 2 NOT NULL,
	"delay_period" real DEFAULT 3 NOT NULL,
	"accel_start" real DEFAULT 2 NOT NULL,
	"accel_rate" real DEFAULT 0.1 NOT NULL,
	"x_offset" integer DEFAULT 30 NOT NULL,
	"word_offset" integer DEFAULT 5 NOT NULL,
	"reader_theme" text DEFAULT 'dark' NOT NULL,
	"reader_font_size" integer DEFAULT 16 NOT NULL,
	"reader_font_family" text DEFAULT 'sans' NOT NULL,
	"reader_line_spacing" real DEFAULT 1.8 NOT NULL,
	"reader_margin" integer DEFAULT 20 NOT NULL,
	"show_reading_time" boolean DEFAULT true NOT NULL,
	"reader_active_word_underline" boolean DEFAULT true NOT NULL,
	"default_reader_mode" text DEFAULT 'scroll' NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "sync_settings_default_reader_mode_check" CHECK ("sync_settings"."default_reader_mode" IN ('scroll', 'rsvp'))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");