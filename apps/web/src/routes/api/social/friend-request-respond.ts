import { RespondToRequestBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { respondToRequest } from "~/lib/social/friends";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/friend-request-respond")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-friend-respond:${userId}`, {
					max: 60,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				const parsed = RespondToRequestBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					const state = await respondToRequest(userId, parsed.data.requestId, parsed.data.action);
					return Response.json({ state });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
