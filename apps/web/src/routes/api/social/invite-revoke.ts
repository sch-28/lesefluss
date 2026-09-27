import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited } from "~/lib/social/http";
import { revokeInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite-revoke")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-invite-revoke:${userId}`, {
					max: 20,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				await revokeInvite(userId);
				return Response.json({ ok: true });
			},
		},
	},
});
