import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";
import { wipeReadingGoals } from "~/lib/sync-wipe";

export const Route = createFileRoute("/api/sync/wipe-goals")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ context }) => {
				const userId = context.user.id;
				const { ok, retryAfter } = checkLimit(`sync-wipe-goals:${userId}`, {
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

				await wipeReadingGoals(userId);
				return Response.json({ ok: true });
			},
		},
	},
});
