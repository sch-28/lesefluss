import { RespondToRequestBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { respondToRequest } from "~/lib/social/friends";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/friend-request-respond")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-friend-respond", max: 60, windowMs: 60 * 60_000 },
				schema: RespondToRequestBodySchema,
				run: async (userId, body) => ({
					state: await respondToRequest(userId, body.requestId, body.action),
				}),
			}),
		},
	},
});
