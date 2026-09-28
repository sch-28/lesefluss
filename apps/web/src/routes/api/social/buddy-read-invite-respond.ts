import { BuddyReadInviteRespondBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { respondToBuddyReadInvite } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-invite-respond")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read-invite-respond", max: 60, windowMs: 60 * 60_000 },
				schema: BuddyReadInviteRespondBodySchema,
				run: (userId, body) => respondToBuddyReadInvite(userId, body.inviteId, body.action),
			}),
		},
	},
});
