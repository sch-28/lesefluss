import { ShareRespondBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { respondToShare } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/share-respond")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`share-respond:${userId}`, { max: 60, windowMs: 60 * 60_000 });
				if (limited) return limited;
				const parsed = ShareRespondBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(
						await respondToShare(userId, parsed.data.shareId, parsed.data.action),
					);
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
