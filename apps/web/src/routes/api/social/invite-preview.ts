import { InviteTokenBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";
import { previewInvite } from "~/lib/social/invite";

export const Route = createFileRoute("/api/social/invite-preview")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "social-invite-preview", max: 60, windowMs: 60 * 60_000 },
				schema: InviteTokenBodySchema,
				run: (userId, body) => previewInvite(db, userId, body.token),
			}),
		},
	},
});
