import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { listFeed } from "~/lib/social/feed";
import { socialAction, validTimeZone } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/feed")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "social-feed", max: 120, windowMs: 60_000 },
				run: async (userId, request) => {
					const url = new URL(request.url);
					const page = await listFeed(userId, {
						cursor: url.searchParams.get("cursor"),
						timeZone: validTimeZone(url.searchParams.get("tz")),
					});
					return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
				},
			}),
		},
	},
});
