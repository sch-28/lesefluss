import { BUDDY_COMMENT_RATE_LIMIT, PostCommentBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { postComment } from "~/lib/social/buddy-read-discussion";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-comment")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-comment:${userId}`, BUDDY_COMMENT_RATE_LIMIT);
				if (limited) return limited;
				const parsed = PostCommentBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					return Response.json(await postComment(userId, parsed.data));
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
