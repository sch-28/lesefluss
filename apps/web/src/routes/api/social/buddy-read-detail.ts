import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { getBuddyRead } from "~/lib/social/buddy-reads";
import { socialGetById } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-detail")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialGetById({
				limit: { key: "buddy-read-detail", max: 60, windowMs: 60_000 },
				run: (userId, id) => getBuddyRead(userId, id),
			}),
		},
	},
});
