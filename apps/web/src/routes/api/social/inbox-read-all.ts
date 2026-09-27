import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited } from "~/lib/social/http";
import { markAllRead } from "~/lib/social/inbox";

export const Route = createFileRoute("/api/social/inbox-read-all")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-inbox-read-all:${userId}`, {
					max: 30,
					windowMs: 60_000,
				});
				if (limited) return limited;
				await markAllRead(userId);
				return Response.json({ ok: true });
			},
		},
	},
});
