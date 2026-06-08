CREATE TABLE "telemetry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"message" text,
	"app_version" text,
	"platform" text,
	"os_version" text,
	"session_id" text,
	"extra" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
