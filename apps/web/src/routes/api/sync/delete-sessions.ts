import { DeleteSessionsRequestSchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";
import { tombstoneSessions } from "~/lib/sync-wipe";

export const Route = createFileRoute("/api/sync/delete-sessions")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const { ok, retryAfter } = checkLimit(`sync-delete-sessions:${userId}`, {
					max: 30,
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

				const parsed = DeleteSessionsRequestSchema.safeParse(
					await request.json().catch(() => null),
				);
				if (!parsed.success) {
					return Response.json({ error: "sessionIds required" }, { status: 400 });
				}

				await tombstoneSessions(userId, parsed.data.sessionIds);
				return Response.json({ ok: true });
			},
		},
	},
});
