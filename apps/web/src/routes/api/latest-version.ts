import { createFileRoute } from "@tanstack/react-router";
import { cors } from "~/lib/cors-middleware";
import { checkLimit, getClientKey } from "~/lib/rate-limit";

/**
 * Latest installable app version per platform. The client compares this against
 * its own version and nudges the user to update. Set LATEST_ANDROID_VERSION to
 * the version that is actually live on the Play Store (not the latest CI build),
 * so users are only prompted for an update they can install. Unset -> no nudge.
 */
const LATEST_ANDROID_VERSION = process.env.LATEST_ANDROID_VERSION?.trim() || null;

export const Route = createFileRoute("/api/latest-version")({
	server: {
		middleware: [cors],
		handlers: {
			GET: async ({ request }) => {
				const { ok, retryAfter } = checkLimit(`latest-version:${getClientKey(request)}`, {
					max: 60,
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
				return Response.json({ android: LATEST_ANDROID_VERSION });
			},
		},
	},
});
