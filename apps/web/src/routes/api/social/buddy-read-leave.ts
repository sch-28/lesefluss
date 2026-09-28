import { BuddyReadIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { leaveBuddyRead } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-leave")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read-leave", max: 60, windowMs: 60 * 60_000 },
				schema: BuddyReadIdBodySchema,
				run: async (userId, body) => {
					await leaveBuddyRead(userId, body.buddyReadId);
				},
			}),
		},
	},
});
