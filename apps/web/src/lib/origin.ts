import { createHmac } from "node:crypto";

export type BookOrigin = { originUserId: string; originBookId: string };

// A dedicated secret when deployed with one; otherwise a key derived from the
// auth secret, so existing deployments need no new variable. Rotating it only
// changes every key at once, which clients absorb on their next pull.
function secret(): string {
	const dedicated = process.env.ORIGIN_KEY_SECRET;
	if (dedicated) return dedicated;
	const base = process.env.BETTER_AUTH_SECRET;
	if (!base) throw new Error("ORIGIN_KEY_SECRET or BETTER_AUTH_SECRET is required");
	return createHmac("sha256", base).update("origin-key").digest("hex");
}

/** Opaque identity of a content origin: equal for every copy, useless for finding the uploader. */
export function originKey(origin: BookOrigin): string {
	return createHmac("sha256", secret())
		.update(`${origin.originUserId}:${origin.originBookId}`)
		.digest("hex");
}
