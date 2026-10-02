/**
 * Search results and stored series can spell the same page differently
 * (scheme, `www.`, trailing slash), so both sides go through this before
 * comparing.
 */
export function normalizeSeriesUrl(url: string): string {
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase().replace(/^www\./, "");
		const path = u.pathname.replace(/\/+$/, "");
		return `${host}${path}${u.search}`;
	} catch {
		return url.trim().replace(/\/+$/, "");
	}
}
