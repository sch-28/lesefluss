import { ShareHighlightBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { shareHighlight } from "~/lib/social/buddy-read-discussion";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-highlight-share")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-highlight-share", max: 60, windowMs: 10 * 60_000 },
				schema: ShareHighlightBodySchema,
				run: (userId, body) => shareHighlight(userId, body),
			}),
		},
	},
});
