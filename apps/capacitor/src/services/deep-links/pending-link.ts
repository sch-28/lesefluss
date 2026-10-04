import { Preferences } from "@capacitor/preferences";
import type { PushLink } from "@lesefluss/core";

const KEY = "social_pending_link";
const MAX_AGE_MS = 24 * 60 * 60_000;

/** Where a link or a tapped notification wanted to go; structured so the replay can navigate with typed params. */
export type PendingLink = { kind: "invite"; token: string } | PushLink;

type Stored = PendingLink & { storedAt: number };

/** Remembers a link while the user finishes onboarding or signs in. Only the latest one is kept. */
export async function setPendingLink(link: PendingLink, now = Date.now()): Promise<void> {
	const value: Stored = { ...link, storedAt: now };
	await Preferences.set({ key: KEY, value: JSON.stringify(value) });
}

function toPendingLink(v: Record<string, unknown>): PendingLink | null {
	switch (v.kind) {
		case "invite":
			return typeof v.token === "string" ? { kind: "invite", token: v.token } : null;
		case "inbox":
			return { kind: "inbox" };
		case "buddy-read":
		case "buddy-read-discussion":
			return typeof v.buddyReadId === "string"
				? { kind: v.kind, buddyReadId: v.buddyReadId }
				: null;
		default:
			return null;
	}
}

/** Returns the pending link once and forgets it; stale or malformed entries are dropped. */
export async function takePendingLink(now = Date.now()): Promise<PendingLink | null> {
	const { value } = await Preferences.get({ key: KEY });
	if (!value) return null;
	await Preferences.remove({ key: KEY });
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return null;
		const stored = parsed as Record<string, unknown>;
		if (typeof stored.storedAt !== "number" || now - stored.storedAt > MAX_AGE_MS) return null;
		return toPendingLink(stored);
	} catch {
		return null;
	}
}

export async function clearPendingLink(): Promise<void> {
	await Preferences.remove({ key: KEY });
}
