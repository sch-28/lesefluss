import { BuddyReadTargetDateBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { setBuddyReadTargetDate } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-target-date")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read-target-date", max: 60, windowMs: 60 * 60_000 },
				schema: BuddyReadTargetDateBodySchema,
				run: async (userId, body) => {
					await setBuddyReadTargetDate(userId, body.buddyReadId, body.targetDate);
				},
			}),
		},
	},
});
