import { Preferences } from "@capacitor/preferences";
import { log } from "../../utils/log";

/**
 * Book ids the server already holds body content for.
 *
 * `pushSync` uses this to omit content it has already uploaded, since the server
 * keeps the stored value when the field is absent. Without it every debounced push
 * re-uploads the full text and cover of the entire library.
 *
 * Persisted rather than kept in memory so a cold start doesn't send one fat push
 * before the first `pullSync` refreshes the set.
 */

const KEY = "sync_server_content";

let cache: Set<string> | null = null;

export async function getServerContentIds(): Promise<Set<string>> {
	if (cache) return cache;
	const { value } = await Preferences.get({ key: KEY });
	let ids: string[] = [];
	if (value) {
		try {
			const parsed: unknown = JSON.parse(value);
			// Shape-check rather than cast: `new Set("abc")` on a stray string yields a
			// set of characters, which would silently suppress real content uploads.
			if (Array.isArray(parsed)) ids = parsed.filter((id) => typeof id === "string");
		} catch (err) {
			// A malformed value would otherwise throw on every push and wedge sync
			// entirely. Falling back to empty costs one redundant content upload.
			log.warn("sync", "server content cache unreadable, resetting:", err);
		}
	}
	cache = new Set(ids);
	return cache;
}

export async function setServerContentIds(ids: Set<string>): Promise<void> {
	cache = ids;
	await Preferences.set({ key: KEY, value: JSON.stringify([...ids]) });
}

export async function addServerContentIds(ids: Iterable<string>): Promise<void> {
	const current = await getServerContentIds();
	const before = current.size;
	for (const id of ids) current.add(id);
	if (current.size === before) return;
	await setServerContentIds(current);
}

export async function clearServerContentIds(): Promise<void> {
	cache = null;
	await Preferences.remove({ key: KEY });
}
