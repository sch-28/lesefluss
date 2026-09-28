import { CheckHandleBodySchema, type HandleAvailability } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { checkHandleAvailability } from "~/lib/social/handle";
import { parseJsonBody, rateLimited } from "~/lib/social/http";

// Answers for the submitted handle only. It is rate-limited so it cannot be
// used to enumerate handles, and it never returns who holds one.
export const Route = createFileRoute("/api/social/handle-check")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-handle-check:${userId}`, {
					max: 30,
					windowMs: 60_000,
				});
				if (limited) return limited;
				const parsed = CheckHandleBodySchema.safeParse(await parseJsonBody(request));
				const result: HandleAvailability = parsed.success
					? await checkHandleAvailability(userId, parsed.data.handle)
					: { available: false, reason: "invalid" };
				return Response.json(result);
			},
		},
	},
});
