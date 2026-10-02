const STORAGE_KEY = "explore-recent-searches";
const MAX_RECENT = 8;

export function readRecentSearches(): string[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
		return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
	} catch {
		return [];
	}
}

function write(list: string[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
	} catch {
		// Recents are a convenience; losing them is fine.
	}
}

/** Most recent first, case-insensitively deduped, capped. */
export function recordRecentSearch(query: string): string[] {
	const q = query.trim();
	if (!q) return readRecentSearches();
	const next = [
		q,
		...readRecentSearches().filter((r) => r.toLowerCase() !== q.toLowerCase()),
	].slice(0, MAX_RECENT);
	write(next);
	return next;
}

export function removeRecentSearch(query: string): string[] {
	const next = readRecentSearches().filter((r) => r !== query);
	write(next);
	return next;
}

export function clearRecentSearches(): void {
	write([]);
}
