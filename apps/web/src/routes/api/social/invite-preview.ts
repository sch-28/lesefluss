import { InviteTokenBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";
import { previewInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite-preview")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-invite-preview:${userId}`, {
					max: 60,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				const parsed = InviteTokenBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(await previewInvite(db, userId, parsed.data.token));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
