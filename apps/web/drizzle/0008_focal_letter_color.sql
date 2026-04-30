ALTER TABLE "sync_settings" ADD COLUMN "focal_letter_color" text DEFAULT '#ff0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_focal_letter_color_check" CHECK ("sync_settings"."focal_letter_color" ~ '^#[0-9A-Fa-f]{6}$');
