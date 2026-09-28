import { DiscussionSettingsBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { updateDiscussionSettings } from "~/lib/social/buddy-read-discussion";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-discussion-settings")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-discussion-settings", max: 30, windowMs: 10 * 60_000 },
				schema: DiscussionSettingsBodySchema,
				run: async (userId, body) => {
					await updateDiscussionSettings(userId, body);
				},
			}),
		},
	},
});
