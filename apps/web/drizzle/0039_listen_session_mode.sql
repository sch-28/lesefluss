ALTER TABLE "sync_reading_sessions" DROP CONSTRAINT "sync_reading_sessions_mode_check";--> statement-breakpoint
ALTER TABLE "sync_reading_sessions" ADD CONSTRAINT "sync_reading_sessions_mode_check" CHECK ("mode" IN ('rsvp', 'scroll', 'page', 'listen'));
