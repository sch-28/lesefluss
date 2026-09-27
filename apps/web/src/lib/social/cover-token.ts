import { createHmac, timingSafeEqual } from "node:crypto";

export type CoverRef = { kind: "book" | "series"; ownerId: string; id: string };

export type CoverToken = CoverRef & { viewerId: string; exp: number };

const TOKEN_TTL_MS = 60 * 60_000;

function secret(): string {
	const value = process.env.BETTER_AUTH_SECRET;
	if (!value) throw new Error("BETTER_AUTH_SECRET is required");
	return value;
}

function sign(body: string): string {
	return createHmac("sha256", secret()).update(body).digest("base64url");
}

/**
 * A cover URL an `<img>` can load without a session: the token names the
 * viewer, the cover and an expiry, signed with the server secret. The route
 * re-checks the friendship when it serves, so a block cuts access before the
 * hour is up.
 */
export function signCoverToken(ref: CoverRef, viewerId: string, now = Date.now()): string {
	const payload: CoverToken = { ...ref, viewerId, exp: now + TOKEN_TTL_MS };
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${body}.${sign(body)}`;
}

export function verifyCoverToken(token: string, now = Date.now()): CoverToken | null {
	const dot = token.lastIndexOf(".");
	if (dot <= 0) return null;
	const body = token.slice(0, dot);
	const given = Buffer.from(token.slice(dot + 1), "base64url");
	const expected = Buffer.from(sign(body), "base64url");
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	let payload: Partial<CoverToken>;
	try {
		payload = JSON.parse(Buffer.from(body, "base64url").toString());
	} catch {
		return null;
	}
	if (
		(payload.kind !== "book" && payload.kind !== "series") ||
		typeof payload.ownerId !== "string" ||
		typeof payload.id !== "string" ||
		typeof payload.viewerId !== "string" ||
		typeof payload.exp !== "number" ||
		payload.exp <= now
	) {
		return null;
	}
	return {
		kind: payload.kind,
		ownerId: payload.ownerId,
		id: payload.id,
		viewerId: payload.viewerId,
		exp: payload.exp,
	};
}
