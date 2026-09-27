import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { listBuddyReads } from "~/lib/social/buddy-reads";
import { rateLimited } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-reads")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-reads:${userId}`, { max: 60, windowMs: 60_000 });
				if (limited) return limited;
				return Response.json(await listBuddyReads(userId));
			},
		},
	},
});
