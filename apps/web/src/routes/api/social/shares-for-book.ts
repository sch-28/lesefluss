import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited } from "~/lib/social/http";
import { listSharesForBook } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/shares-for-book")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = rateLimited(`shares-for-book:${userId}`, { max: 120, windowMs: 60_000 });
				if (limited) return limited;
				const bookId = new URL(request.url).searchParams.get("bookId") ?? "";
				if (!/^[0-9a-f]{8}$/.test(bookId)) {
					return Response.json({ error: "Invalid payload", reason: "invalid" }, { status: 400 });
				}
				return Response.json(await listSharesForBook(userId, bookId));
			},
		},
	},
});
