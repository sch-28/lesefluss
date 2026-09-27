import { ClaimHandleBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { claimHandle } from "~/lib/social/handle";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { getOwnProfile } from "~/lib/social/profile";

export const Route = createFileRoute("/api/social/handle")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-handle-claim:${userId}`, {
					max: 5,
					windowMs: 10 * 60_000,
				});
				if (limited) return limited;
				const parsed = ClaimHandleBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) {
					return invalidPayloadResponse();
				}
				try {
					await claimHandle(userId, parsed.data.handle, parsed.data.name);
				} catch (err) {
					return socialErrorResponse(err);
				}
				return Response.json(await getOwnProfile(userId));
			},
		},
	},
});
