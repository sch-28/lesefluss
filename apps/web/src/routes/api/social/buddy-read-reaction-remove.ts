import { BUDDY_REACTION_RATE_LIMIT, ReactionBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { removeReaction } from "~/lib/social/buddy-read-discussion";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-reaction-remove")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-reaction:${userId}`, BUDDY_REACTION_RATE_LIMIT);
				if (limited) return limited;
				const parsed = ReactionBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					await removeReaction(userId, parsed.data);
					return Response.json({ ok: true });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
