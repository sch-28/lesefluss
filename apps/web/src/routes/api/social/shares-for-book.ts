import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { invalidPayloadResponse, socialAction } from "~/lib/social/http";
import { listSharesForBook } from "~/lib/social/shares";

export const Route = createFileRoute("/api/social/shares-for-book")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "shares-for-book", max: 120, windowMs: 60_000 },
				run: async (userId, request) => {
					const bookId = new URL(request.url).searchParams.get("bookId") ?? "";
					if (!/^[0-9a-f]{8}$/.test(bookId)) return invalidPayloadResponse();
					return listSharesForBook(userId, bookId);
				},
			}),
		},
	},
});
