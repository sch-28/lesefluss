import { UserIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { sendFriendRequest } from "~/lib/social/friends";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/friend-request")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-friend-request", max: 30, windowMs: 60 * 60_000 },
				schema: UserIdBodySchema,
				run: async (userId, body) => ({ state: await sendFriendRequest(userId, body.userId) }),
			}),
		},
	},
});
