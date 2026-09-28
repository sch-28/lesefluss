import { BUDDY_REACTION_RATE_LIMIT, ReactionBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { removeReaction } from "~/lib/social/buddy-read-discussion";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-reaction-remove")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-reaction", ...BUDDY_REACTION_RATE_LIMIT },
				schema: ReactionBodySchema,
				run: async (userId, body) => {
					await removeReaction(userId, body);
				},
			}),
		},
	},
});
