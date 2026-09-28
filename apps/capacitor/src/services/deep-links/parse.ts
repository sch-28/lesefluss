import { SYNC_URL } from "../sync/auth-client";

export type DeepLink =
	| { kind: "invite"; token: string }
	/** Under a claimed prefix, but this build does not know the path. */
	| { kind: "unknown-claimed"; url: string };

const FALLBACK_ORIGIN = "https://lesefluss.app";
const CLAIMED_PREFIXES = ["/invite/"];
// 32 random bytes in base64url are 43 characters; allow some slack for a
// future longer token without accepting arbitrary strings.
const INVITE_TOKEN = /^[A-Za-z0-9_-]{40,64}$/;

/** The origin App Links are claimed for. The dev server can point elsewhere; production is lesefluss.app. */
export function claimedOrigin(): string {
	try {
		return new URL(SYNC_URL || FALLBACK_ORIGIN).origin;
	} catch {
		return FALLBACK_ORIGIN;
	}
}

/**
 * Maps an incoming URL to an in-app destination. Anything not under a claimed
 * https path on our origin is "not ours" (null) and left to the platform.
 */
export function parseDeepLink(raw: string): DeepLink | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== "https:") return null;
	if (url.origin !== claimedOrigin() && url.origin !== FALLBACK_ORIGIN) return null;
	if (!CLAIMED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;

	const inviteMatch = url.pathname.match(/^\/invite\/([^/]+)\/?$/);
	if (inviteMatch?.[1]) {
		const token = decodeURIComponent(inviteMatch[1]);
		if (INVITE_TOKEN.test(token)) return { kind: "invite", token };
	}
	return { kind: "unknown-claimed", url: url.toString() };
}

/** Finds an invite link inside pasted text ("Join me: https://... see you"). */
export function parsePastedInvite(text: string): { kind: "invite"; token: string } | null {
	for (const word of text.split(/\s+/)) {
		const parsed = parseDeepLink(word);
		if (parsed?.kind === "invite") return parsed;
	}
	return null;
}

export function inviteRoute(token: string): string {
	return `/tabs/social/invite/${encodeURIComponent(token)}`;
}
