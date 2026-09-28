import { ShareRespondBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { respondToShare } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/share-respond")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "share-respond", max: 60, windowMs: 60 * 60_000 },
				schema: ShareRespondBodySchema,
				run: (userId, body) => respondToShare(userId, body.shareId, body.action),
			}),
		},
	},
});
