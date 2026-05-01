import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { syncReadingSessions } from "~/db/schema";
import { cors } from "~/lib/cors-middleware";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";

export const Route = createFileRoute("/api/sync/wipe-sessions")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ context }) => {
				const userId = context.user.id;
				const { ok, retryAfter } = checkLimit(`sync-wipe:${userId}`, {
					max: 5,
					windowMs: 60_000,
				});
				if (!ok) {
					return Response.json(
						{ error: "Too many requests" },
						{
							status: 429,
							headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
						},
					);
				}

				await db.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, userId));
				return Response.json({ ok: true });
			},
		},
	},
});
