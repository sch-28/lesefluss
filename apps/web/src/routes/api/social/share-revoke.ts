import { ShareIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { revokeShare } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/share-revoke")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`share-revoke:${userId}`, { max: 60, windowMs: 60 * 60_000 });
				if (limited) return limited;
				const parsed = ShareIdBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					await revokeShare(userId, parsed.data.shareId);
					return Response.json({ ok: true });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
