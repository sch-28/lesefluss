import { ReportBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { createNotice } from "~/lib/moderation/notices";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited, socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/report")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "report", max: 10, windowMs: 60 * 60_000 },
				schema: ReportBodySchema,
				run: async (userId, body) => {
					if (body.block) {
						// Same budget as the block endpoint, so reporting is not a second way to mass-block.
						const blockLimited = rateLimited(`social-block:${userId}`, {
							max: 60,
							windowMs: 60 * 60_000,
						});
						if (blockLimited) return blockLimited;
					}
					return createNotice(userId, body);
				},
			}),
		},
	},
});
