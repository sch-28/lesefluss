import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { getDiscussion } from "~/lib/social/buddy-read-discussion";
import { socialGetById } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-discussion")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialGetById({
				limit: { key: "buddy-read-discussion", max: 120, windowMs: 60_000 },
				run: (userId, id) => getDiscussion(userId, id),
			}),
		},
	},
});
