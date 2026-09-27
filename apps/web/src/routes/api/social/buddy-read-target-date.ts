import { BuddyReadTargetDateBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { setBuddyReadTargetDate } from "~/lib/social/buddy-reads";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-target-date")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-read-target-date:${userId}`, {
					max: 60,
					windowMs: 60 * 60_000,
				});
				if (limited) return limited;
				const parsed = BuddyReadTargetDateBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					await setBuddyReadTargetDate(userId, parsed.data.buddyReadId, parsed.data.targetDate);
					return Response.json({ ok: true });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
