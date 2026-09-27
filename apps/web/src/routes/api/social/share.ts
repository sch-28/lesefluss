import { ShareBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { createShare } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/share")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				// Burst guard only; the daily cap is counted in Postgres.
				const limited = rateLimited(`share:${userId}`, { max: 20, windowMs: 10 * 60_000 });
				if (limited) return limited;
				const parsed = ShareBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(await createShare(userId, parsed.data));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
