import { ShareBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { createShare } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/share")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			// Burst guard only; the daily cap is counted in Postgres.
			POST: socialPost({
				limit: { key: "share", max: 20, windowMs: 10 * 60_000 },
				schema: ShareBodySchema,
				run: (userId, body) => createShare(userId, body),
			}),
		},
	},
});
