import { WebNoticeBodySchema } from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { createWebNotice } from "~/lib/moderation/notices";
import { fieldErrors } from "~/lib/moderation/web-form";
import { readBodyCapped } from "~/lib/public-form";
import { checkLimit, getClientKey } from "~/lib/rate-limit";

function tooMany(retryAfter: number | undefined): Response {
	return Response.json(
		{ error: "Too many notices from here. Please try again later." },
		{ status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
	);
}

// Public by design (DSA Art. 16): anyone may notify, signed in or not.
export const Route = createFileRoute("/api/report")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const text = await readBodyCapped(request);
				if (text === null) {
					return Response.json({ error: "The notice is too long." }, { status: 413 });
				}
				let body: unknown;
				try {
					body = JSON.parse(text);
				} catch {
					return Response.json({ error: "Invalid JSON" }, { status: 400 });
				}
				if (!body || typeof body !== "object") {
					return Response.json({ error: "Invalid payload" }, { status: 400 });
				}
				// Honeypot: a filled hidden field is a bot; pretend it worked.
				if ((body as Record<string, unknown>).company) return Response.json({ ok: true });

				const client = checkLimit(`report:${getClientKey(request)}`, {
					max: 5,
					windowMs: 60 * 60_000,
				});
				if (!client.ok) return tooMany(client.retryAfter);
				const global = checkLimit("report:global", { max: 50, windowMs: 60 * 60_000 });
				if (!global.ok) return tooMany(global.retryAfter);

				const parsed = WebNoticeBodySchema.safeParse(body);
				if (!parsed.success) {
					return Response.json(
						{
							error: "Please check the highlighted fields.",
							fields: fieldErrors(parsed.error.issues),
						},
						{ status: 400 },
					);
				}
				const { id } = await createWebNotice(parsed.data);
				return Response.json({ ok: true, id });
			},
		},
	},
});
