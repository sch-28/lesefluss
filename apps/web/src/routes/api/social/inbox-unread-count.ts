import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited } from "~/lib/social/http";
import { unreadCount } from "~/lib/social/inbox";

// Called on every app foreground, so it has its own generous bucket.
export const Route = createFileRoute("/api/social/inbox-unread-count")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-inbox-count:${userId}`, { max: 120, windowMs: 60_000 });
				if (limited) return limited;
				return Response.json({ count: await unreadCount(userId) });
			},
		},
	},
});
