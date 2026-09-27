import { ShareHighlightBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { shareHighlight } from "~/lib/social/buddy-read-discussion";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-highlight-share")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-highlight-share:${userId}`, {
					max: 60,
					windowMs: 10 * 60_000,
				});
				if (limited) return limited;
				const parsed = ShareHighlightBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(await shareHighlight(userId, parsed.data));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
