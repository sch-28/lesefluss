import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { getBuddyRead } from "~/lib/social/buddy-reads";
import { invalidPayloadResponse, rateLimited, socialErrorResponse } from "~/lib/social/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/social/buddy-read-detail")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-read-detail:${userId}`, { max: 60, windowMs: 60_000 });
				if (limited) return limited;
				const id = new URL(request.url).searchParams.get("id") ?? "";
				if (!UUID.test(id)) return invalidPayloadResponse();
				try {
					return Response.json(await getBuddyRead(userId, id));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
