import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialAction } from "~/lib/social/http";
import { revokeInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite-revoke")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialAction({
				limit: { key: "social-invite-revoke", max: 20, windowMs: 60 * 60_000 },
				run: async (userId) => {
					await revokeInvite(userId);
				},
			}),
		},
	},
});
