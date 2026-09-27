import { InviteTokenBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { redeemInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite-redeem")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-invite-redeem:${userId}`, {
					max: 20,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				const parsed = InviteTokenBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(await redeemInvite(userId, parsed.data.token));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
