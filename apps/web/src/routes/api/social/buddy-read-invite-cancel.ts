import { BuddyReadInviteIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { cancelBuddyReadInvite } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-invite-cancel")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read-invite-cancel", max: 60, windowMs: 60 * 60_000 },
				schema: BuddyReadInviteIdBodySchema,
				run: async (userId, body) => {
					await cancelBuddyReadInvite(userId, body.inviteId);
				},
			}),
		},
	},
});
