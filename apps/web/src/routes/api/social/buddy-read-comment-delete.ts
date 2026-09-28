import { CommentIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { deleteComment } from "~/lib/social/buddy-read-discussion";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-comment-delete")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-comment-delete", max: 60, windowMs: 10 * 60_000 },
				schema: CommentIdBodySchema,
				run: async (userId, body) => {
					await deleteComment(userId, body.commentId);
				},
			}),
		},
	},
});
