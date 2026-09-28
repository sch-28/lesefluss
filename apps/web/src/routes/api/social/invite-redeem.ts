import { InviteTokenBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { redeemInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite-redeem")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-invite-redeem", max: 20, windowMs: 60 * 60_000 },
				schema: InviteTokenBodySchema,
				run: (userId, body) => redeemInvite(userId, body.token),
			}),
		},
	},
});
