import { UserIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { blockUser } from "~/lib/social/friends";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/block")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-block", max: 60, windowMs: 60 * 60_000 },
				schema: UserIdBodySchema,
				run: async (userId, body) => {
					await blockUser(userId, body.userId);
				},
			}),
		},
	},
});
