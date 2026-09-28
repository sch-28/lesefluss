import { ClaimHandleBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { claimHandle } from "~/lib/social/handle";
import { socialPost } from "~/lib/social/http";
import { getOwnProfile } from "~/lib/social/profile";

export const Route = createFileRoute("/api/social/handle")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-handle-claim", max: 5, windowMs: 10 * 60_000 },
				schema: ClaimHandleBodySchema,
				run: async (userId, body) => {
					await claimHandle(userId, body.handle, body.name);
					return getOwnProfile(userId);
				},
			}),
		},
	},
});
