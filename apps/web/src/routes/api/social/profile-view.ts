import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { invalidPayloadResponse, socialAction, validTimeZone } from "~/lib/social/http";
import { resolveProfileView } from "~/lib/social/profile-view";

// Looked up by user id only; a handle is never a lookup key.
export const Route = createFileRoute("/api/social/profile-view")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: socialAction({
				limit: { key: "social-profile-view", max: 120, windowMs: 60_000 },
				run: async (viewerId, request) => {
					const url = new URL(request.url);
					const targetId = url.searchParams.get("userId");
					if (!targetId || targetId.length > 100) return invalidPayloadResponse();
					const asFriend = url.searchParams.get("as") === "friend" && targetId === viewerId;
					const fallbackTimeZone = validTimeZone(url.searchParams.get("tz"));
					const view = await resolveProfileView(viewerId, targetId, {
						asFriend,
						fallbackTimeZone,
					});
					return Response.json(view, { headers: { "Cache-Control": "private, no-store" } });
				},
			}),
		},
	},
});
