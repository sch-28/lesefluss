import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialAction } from "~/lib/social/http";
import { createInvite, getCurrentInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ context }) => Response.json(await getCurrentInvite(context.user.id)),
			POST: socialAction({
				limit: { key: "social-invite-create", max: 10, windowMs: 24 * 60 * 60_000 },
				run: (userId) => createInvite(userId),
			}),
		},
	},
});
