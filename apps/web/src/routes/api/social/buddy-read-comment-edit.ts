import { BUDDY_COMMENT_RATE_LIMIT, EditCommentBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { editComment } from "~/lib/social/buddy-read-discussion";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read-comment-edit")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-comment", ...BUDDY_COMMENT_RATE_LIMIT },
				schema: EditCommentBodySchema,
				run: async (userId, body) => {
					await editComment(userId, body);
				},
			}),
		},
	},
});
