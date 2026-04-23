/**
 * Add `https://` if the user left off the scheme. Leaves trimmed-empty input
 * alone so `isLikelyUrl` can reject it.
 */
export function normalizeUrl(raw: string): string {
	const t = raw.trim();
	if (!t) return t;
	if (/^https?:\/\//i.test(t)) return t;
	return `https://${t}`;
}

/** True if `s` parses as an http/https URL. */
export function isLikelyUrl(s: string): boolean {
	try {
		const u = new URL(s);
		return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
	} catch {
		return false;
	}
}

/** Hostname without `www.` prefix, suitable for display. */
export function displayHostname(url: string): string {
	try {
		const h = new URL(url).hostname;
		return h.startsWith("www.") ? h.slice(4) : h;
	} catch {
		return url;
	}
}
