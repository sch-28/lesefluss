import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";
import { tombstoneSession } from "~/lib/sync-wipe";

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
				// The push schema's cap: an unknown id now leaves a permanent placeholder row.
				const sessionId =
					body && typeof body.sessionId === "string" && body.sessionId.length <= 64
						? body.sessionId
						: null;
				if (!sessionId) {
					return Response.json({ error: "sessionId required" }, { status: 400 });
				}

				await tombstoneSession(userId, sessionId);
				return Response.json({ ok: true });
			},
		},
	},
});
