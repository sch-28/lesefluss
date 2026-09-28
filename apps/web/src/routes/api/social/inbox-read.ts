import { InboxItemIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { markRead } from "~/lib/social/inbox";

export const Route = createFileRoute("/api/social/inbox-read")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-inbox-read", max: 120, windowMs: 60_000 },
				schema: InboxItemIdBodySchema,
				run: async (userId, body) => {
					await markRead(userId, body.id);
				},
			}),
		},
	},
});
