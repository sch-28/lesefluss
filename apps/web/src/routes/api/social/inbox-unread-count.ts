import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialAction } from "~/lib/social/http";
import { unreadCount } from "~/lib/social/inbox";

// Called on every app foreground, so it has its own generous bucket.
export const Route = createFileRoute("/api/social/inbox-unread-count")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "social-inbox-count", max: 120, windowMs: 60_000 },
				run: async (userId) => ({ count: await unreadCount(userId) }),
			}),
		},
	},
});
