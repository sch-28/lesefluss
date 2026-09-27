import { DiscussionSettingsBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { updateDiscussionSettings } from "~/lib/social/buddy-read-discussion";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-discussion-settings")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-discussion-settings:${userId}`, {
					max: 30,
					windowMs: 10 * 60_000,
				});
				if (limited) return limited;
				const parsed = DiscussionSettingsBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					await updateDiscussionSettings(userId, parsed.data);
					return Response.json({ ok: true });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
