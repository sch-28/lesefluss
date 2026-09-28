import { BuddyReadRemoveMemberBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { removeBuddyReadMember } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-remove-member")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read-remove-member", max: 60, windowMs: 60 * 60_000 },
				schema: BuddyReadRemoveMemberBodySchema,
				run: async (userId, body) => {
					await removeBuddyReadMember(userId, body.buddyReadId, body.userId);
				},
			}),
		},
	},
});
