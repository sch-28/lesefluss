import { Preferences } from "@capacitor/preferences";

const KEY = "social_pending_link";
const MAX_AGE_MS = 24 * 60 * 60_000;

/** Where a link wanted to go; structured so the replay can navigate with typed params. */
export type PendingLink = { kind: "invite"; token: string };

type Stored = PendingLink & { storedAt: number };

/** Remembers a link while the user finishes onboarding or signs in. Only the latest one is kept. */
export async function setPendingLink(link: PendingLink, now = Date.now()): Promise<void> {
	const value: Stored = { ...link, storedAt: now };
	await Preferences.set({ key: KEY, value: JSON.stringify(value) });
}

/** Returns the pending link once and forgets it; stale or malformed entries are dropped. */
export async function takePendingLink(now = Date.now()): Promise<PendingLink | null> {
	const { value } = await Preferences.get({ key: KEY });
	if (!value) return null;
	await Preferences.remove({ key: KEY });
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { kind, token, storedAt } = parsed as Partial<Stored>;
		if (kind !== "invite" || typeof token !== "string" || typeof storedAt !== "number") return null;
		return now - storedAt <= MAX_AGE_MS ? { kind, token } : null;
	} catch {
		return null;
	}
}

export async function clearPendingLink(): Promise<void> {
	await Preferences.remove({ key: KEY });
}
