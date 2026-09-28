import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { invalidPayloadResponse, socialAction } from "~/lib/social/http";
import { openLiveStream } from "~/lib/social/live";
import { isUuid } from "~/lib/uuid";

export const Route = createFileRoute("/api/social/live-stream")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "live-stream", max: 30, windowMs: 60_000 },
				run: async (userId, request) => {
					const buddyReadId = new URL(request.url).searchParams.get("buddyReadId") ?? "";
					if (!isUuid(buddyReadId)) return invalidPayloadResponse();
					return openLiveStream(userId, buddyReadId, request.signal);
				},
			}),
		},
	},
});
