import { PushPreferencesPatchSchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { cors } from "~/lib/cors-middleware";
import { loadPushPreferences, updatePushPreferences } from "~/lib/push/preferences";
import { requireAuth } from "~/lib/session-middleware";
import { socialAction, socialPost } from "~/lib/social/http";

export const Route = createFileRoute("/api/push/preferences")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "push-preferences", max: 60, windowMs: 60_000 },
				run: (userId) => loadPushPreferences(db, userId),
			}),
			POST: socialPost({
				limit: { key: "push-preferences-update", max: 30, windowMs: 60_000 },
				schema: PushPreferencesPatchSchema,
				run: (userId, body) => updatePushPreferences(userId, body),
			}),
		},
	},
});
