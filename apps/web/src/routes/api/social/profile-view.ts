import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { requireAuth } from "~/lib/session-middleware";
import { rateLimited, socialErrorResponse } from "~/lib/social/http";
import { resolveProfileView } from "~/lib/social/profile-view";

/** An unknown zone falls back to UTC rather than failing the whole view. */
function validTimeZone(raw: string | null): string | undefined {
	if (!raw || raw.length > 64) return undefined;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: raw });
		return raw;
	} catch {
		return undefined;
	}
}

// Looked up by user id only; a handle is never a lookup key.
export const Route = createFileRoute("/api/social/profile-view")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			GET: async ({ request, context }) => {
				const viewerId = context.user.id;
				const limited = rateLimited(`social-profile-view:${viewerId}`, {
					max: 120,
					windowMs: 60_000,
				});
				if (limited) return limited;
				const url = new URL(request.url);
				const targetId = url.searchParams.get("userId");
				if (!targetId || targetId.length > 100) {
					return Response.json({ error: "Invalid payload", reason: "invalid" }, { status: 400 });
				}
				const asFriend = url.searchParams.get("as") === "friend" && targetId === viewerId;
				const timeZone = validTimeZone(url.searchParams.get("tz"));
				try {
					const view = await resolveProfileView(viewerId, targetId, { asFriend, timeZone });
					return Response.json(view, { headers: { "Cache-Control": "private, no-store" } });
				} catch (err) {
					return socialErrorResponse(err);
				}
			},
		},
	},
});
