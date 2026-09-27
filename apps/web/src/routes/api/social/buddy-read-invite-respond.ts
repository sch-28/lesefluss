import { BuddyReadInviteRespondBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { respondToBuddyReadInvite } from "~/lib/social/buddy-reads";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-invite-respond")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-read-invite-respond:${userId}`, {
					max: 60,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				const parsed = BuddyReadInviteRespondBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(
						await respondToBuddyReadInvite(userId, parsed.data.inviteId, parsed.data.action),
					);
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
