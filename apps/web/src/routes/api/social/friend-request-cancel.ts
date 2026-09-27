import { RequestIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { cancelRequest } from "~/lib/social/friends";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/friend-request-cancel")({
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
				const parsed = RequestIdBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					await cancelRequest(userId, parsed.data.requestId);
					return Response.json({ state: "none" });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
