import { PushRegisterBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { registerPushToken } from "~/lib/push/tokens";
import { requireAuth } from "~/lib/session-middleware";
import { socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/push/register")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: socialPost({
				limit: { key: "push-register", max: 20, windowMs: 60 * 60_000 },
				schema: PushRegisterBodySchema,
				run: async (userId, body, sessionId) => {
					await registerPushToken({ ...body, userId, sessionId });
				},
			}),
		},
	},
});
