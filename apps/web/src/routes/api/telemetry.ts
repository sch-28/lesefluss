import { createFileRoute } from "@tanstack/react-router";
import { db } from "~/db";
import { telemetryEvents } from "~/db/schema";
import { cors } from "~/lib/cors-middleware";
import { checkLimit, getClientKey } from "~/lib/rate-limit";

// Diagnostics payloads are a handful of short strings; anything larger is abuse.
const MAX_BODY_BYTES = 8_000;
const MAX_EXTRA_CHARS = 2_000;

const cap = (value: unknown, max: number): string | null =>
	typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;

/**
 * Anonymous diagnostics sink. No auth: the failures we most need to see come
 * from no-account users, whose clients have no token. Payload is anonymized
 * (ephemeral session id, version, platform, coarse OS, error message).
 */
export const Route = createFileRoute("/api/telemetry")({
	server: {
		middleware: [cors],
		handlers: {
			POST: async ({ request }) => {
				const { ok, retryAfter } = checkLimit(`telemetry:${getClientKey(request)}`, {
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

				const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
				if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
					return Response.json({ error: "Payload too large" }, { status: 413 });
				}

				const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
				const type = cap(body?.type, 64);
				if (!type) return Response.json({ error: "type required" }, { status: 400 });

				// Bound the free-form jsonb so a missing/lying content-length can't store
				// a huge or deeply-nested object (every other field is length-capped).
				const rawExtra =
					body?.extra && typeof body.extra === "object" && !Array.isArray(body.extra)
						? (body.extra as Record<string, unknown>)
						: null;
				const extra =
					rawExtra && JSON.stringify(rawExtra).length <= MAX_EXTRA_CHARS ? rawExtra : null;

				await db.insert(telemetryEvents).values({
					type,
					message: cap(body?.message, 1000),
					appVersion: cap(body?.version, 32),
					platform: cap(body?.platform, 32),
					osVersion: cap(body?.os, 64),
					sessionId: cap(body?.sessionId, 64),
					extra,
				});

				return Response.json({ ok: true });
			},
		},
	},
});
