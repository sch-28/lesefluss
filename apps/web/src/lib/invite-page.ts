import { InviteTokenBodySchema } from "@lesefluss/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { db } from "~/db";
import { auth } from "./auth";
import { checkLimit, getClientKey } from "./rate-limit";
import { previewInvite } from "./social/invite";

/**
 * Server-rendered, signed-in or not, and never redeems: link previews from
 * chat apps hit this. Unauthenticated, so the limit is per client IP and
 * generous enough for a shared preview bot.
 */
export const previewInviteForPage = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => InviteTokenBodySchema.parse(data))
	.handler(async ({ data }) => {
		const request = getRequest();
		const { ok } = checkLimit(`invite-page:${getClientKey(request)}`, {
			max: 120,
			windowMs: 60_000,
		});
		if (!ok) return { state: "invalid" as const };
		const session = await auth.api.getSession({ headers: request.headers });
		return previewInvite(db, session?.user.id ?? null, data.token);
	});
