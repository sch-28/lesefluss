import { BuddyReadInviteBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { inviteToBuddyRead } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-invite")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read-invite", max: 60, windowMs: 60 * 60_000 },
				schema: BuddyReadInviteBodySchema,
				run: async (userId, body) => {
					await inviteToBuddyRead(userId, body.buddyReadId, body.inviteeIds);
				},
			}),
		},
	},
});
