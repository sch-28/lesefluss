import { CreateBuddyReadBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { createBuddyRead } from "~/lib/social/buddy-reads";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/social/buddy-read")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "buddy-read", max: 20, windowMs: 60 * 60_000 },
				schema: CreateBuddyReadBodySchema,
				run: (userId, body) => createBuddyRead(userId, body),
			}),
		},
	},
});
