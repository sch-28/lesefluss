import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { syncReadingSessions } from "~/db/schema";
import { cors } from "~/lib/cors-middleware";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";

export const Route = createFileRoute("/api/sync/delete-session")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const { ok, retryAfter } = checkLimit(`sync-delete-session:${userId}`, {
					max: 60,
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

				const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
				const sessionId = body && typeof body.sessionId === "string" ? body.sessionId : null;
				if (!sessionId) {
					return Response.json({ error: "sessionId required" }, { status: 400 });
				}

				await db
					.delete(syncReadingSessions)
					.where(
						and(
							eq(syncReadingSessions.userId, userId),
							eq(syncReadingSessions.sessionId, sessionId),
						),
					);
				return Response.json({ ok: true });
			},
		},
	},
});
