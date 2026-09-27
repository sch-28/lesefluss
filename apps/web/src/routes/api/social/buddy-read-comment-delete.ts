import { CommentIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { deleteComment } from "~/lib/social/buddy-read-discussion";
import {
	invalidPayloadResponse,
	parseJsonBody,
	rateLimited,
	socialErrorResponse,
} from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-comment-delete")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`buddy-comment-delete:${userId}`, {
					max: 60,
					windowMs: 10 * 60_000,
				});
				if (limited) return limited;
				const parsed = CommentIdBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				try {
					await deleteComment(userId, parsed.data.commentId);
					return Response.json({ ok: true });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
