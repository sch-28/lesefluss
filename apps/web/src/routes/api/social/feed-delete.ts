import { FeedDeleteBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { deleteFeedEvent, FEED_DELETE_LIMIT } from "~/lib/social/feed";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/feed-delete")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: FEED_DELETE_LIMIT,
				schema: FeedDeleteBodySchema,
				run: async (userId, body) => {
					await deleteFeedEvent(userId, body.eventId);
					return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
				},
			}),
		},
	},
});
