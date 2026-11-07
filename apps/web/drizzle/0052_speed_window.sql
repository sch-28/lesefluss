ALTER TABLE "sync_settings" ADD COLUMN "speed_window" text DEFAULT 'recent' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_speed_window_check" CHECK ("sync_settings"."speed_window" IN ('recent', '30d', 'all'));
