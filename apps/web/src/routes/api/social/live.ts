import { LiveActionBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { reportLive, stopLive } from "~/lib/social/live";

export const Route = createFileRoute("/api/social/live")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				// Each open reader sends about 30 a minute; this leaves room for about nine
				// readers of one user at once (tabs, devices), plus their stops.
				limit: { key: "live-report", max: 300, windowMs: 60_000 },
				schema: LiveActionBodySchema,
				run: async (userId, body) => {
					if (body.action === "stop") stopLive(userId, body.buddyReadId, body.sentAt);
					else await reportLive(userId, body.buddyReadId, body);
				},
			}),
		},
	},
});
