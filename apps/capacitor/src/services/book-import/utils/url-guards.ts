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

/**
 * Extracts a single http/https URL embedded in mixed text, e.g. the Google
 * share format "Article title https://share.google/xyz". Returns the URL when
 * exactly one is found and the surrounding text is short (title-length). Returns
 * null for long prose that incidentally contains a link.
 */
export function extractEmbeddedUrl(text: string): string | null {
	const match = text.match(/https?:\/\/\S+/);
	if (!match) return null;
	// Strip trailing punctuation that often gets attached to URLs in share text.
	const url = match[0].replace(/[.,;:!?)]+$/, "");
	const nonUrl = text.replace(match[0], "").trim();
	// More than 300 chars of surrounding text means this is prose, not a title.
	if (nonUrl.length > 300) return null;
	try {
		const u = new URL(url);
		return u.protocol === "http:" || u.protocol === "https:" ? url : null;
	} catch {
		return null;
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
