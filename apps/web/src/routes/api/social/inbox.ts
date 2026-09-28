import { INBOX_PAGE_SIZE } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { socialAction } from "~/lib/social/http";
import { listInbox } from "~/lib/social/inbox";

export const Route = createFileRoute("/api/social/inbox")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "social-inbox", max: 120, windowMs: 60_000 },
				run: (userId, request) => {
					const url = new URL(request.url);
					const requested = Number(url.searchParams.get("limit") ?? INBOX_PAGE_SIZE);
					const limit = Number.isInteger(requested)
						? Math.min(Math.max(requested, 1), 100)
						: INBOX_PAGE_SIZE;
					return listInbox(userId, url.searchParams.get("cursor"), new Date(), limit);
				},
			}),
		},
	},
});
