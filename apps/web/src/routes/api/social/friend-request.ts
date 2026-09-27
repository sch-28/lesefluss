import { UserIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { sendFriendRequest } from "~/lib/social/friends";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/friend-request")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-friend-request:${userId}`, {
					max: 30,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				const parsed = UserIdBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					const state = await sendFriendRequest(userId, parsed.data.userId);
					return Response.json({ state });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
