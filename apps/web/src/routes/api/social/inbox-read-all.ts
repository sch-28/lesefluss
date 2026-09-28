import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialAction } from "~/lib/social/http";
import { markAllRead } from "~/lib/social/inbox";

export const Route = createFileRoute("/api/social/inbox-read-all")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialAction({
				limit: { key: "social-inbox-read-all", max: 30, windowMs: 60_000 },
				run: async (userId) => {
					await markAllRead(userId);
				},
			}),
		},
	},
});
