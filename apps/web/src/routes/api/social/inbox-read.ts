import { InboxItemIdBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { invalidPayloadResponse, parseJsonBody, rateLimited } from "~/lib/social/http";
import { markRead } from "~/lib/social/inbox";

export const Route = createFileRoute("/api/social/inbox-read")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`social-inbox-read:${userId}`, { max: 120, windowMs: 60_000 });
				if (limited) return limited;
				const parsed = InboxItemIdBodySchema.safeParse(await parseJsonBody(request));
				if (!parsed.success) return invalidPayloadResponse();
				await markRead(userId, parsed.data.id);
				return Response.json({ ok: true });
			},
		},
	},
});
