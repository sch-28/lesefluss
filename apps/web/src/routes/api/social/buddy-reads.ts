import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { listBuddyReads } from "~/lib/social/buddy-reads";
import { socialAction } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-reads")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "buddy-reads", max: 60, windowMs: 60_000 },
				run: (userId) => listBuddyReads(userId),
			}),
		},
	},
});
