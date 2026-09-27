import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited, socialErrorResponse } from "~/lib/social/http";
import { createInvite, getCurrentInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => Response.json(await getCurrentInvite(context.user.id)),
			POST: async ({ context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-invite-create:${userId}`, {
					max: 10,
					windowMs: 24 * 60 * 60_000,
				});
				if (limited) return limited;
				try {
					return Response.json(await createInvite(userId));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
