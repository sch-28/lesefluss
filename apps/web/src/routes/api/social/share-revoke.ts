import { ShareIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { revokeShare } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/share-revoke")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "share-revoke", max: 60, windowMs: 60 * 60_000 },
				schema: ShareIdBodySchema,
				run: async (userId, body) => {
					await revokeShare(userId, body.shareId);
				},
			}),
		},
	},
});
