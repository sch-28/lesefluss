import { ReportBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { createNotice } from "~/lib/moderation/notices";
import { requireAuth } from "~/lib/session-middleware";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/report")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`report:${userId}`, { max: 10, windowMs: 60 * 60_000 });
				if (limited) return limited;
				const parsed = ReportBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				if (parsed.data.block) {
					// Same budget as the block endpoint, so reporting is not a second way to mass-block.
					const blockLimited = rateLimited(`social-block:${userId}`, {
						max: 60,
						windowMs: 60 * 60_000,
					});
					if (blockLimited) return blockLimited;
				}
				try {
					return Response.json(await createNotice(userId, parsed.data));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
