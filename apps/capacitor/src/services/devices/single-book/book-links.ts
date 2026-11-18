/**
 * Device book hash → library book id, recorded when a single-book device's book
 * was found by its title. The device keeps the id it was sent under, so without
 * the link every later sync would search by title again. Device-local: another
 * install has its own library ids.
 */

const KEY = "lesefluss:single-book-links";

export function readSingleBookLinks(): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const links: Record<string, string> = {};
		for (const [hash, bookId] of Object.entries(parsed)) {
			if (typeof bookId === "string") links[hash] = bookId;
		}
		return links;
	} catch {
		return {};
	}
}

export function linkSingleBook(deviceHash: string, bookId: string): void {
	try {
		localStorage.setItem(KEY, JSON.stringify({ ...readSingleBookLinks(), [deviceHash]: bookId }));
	} catch {
		// Without storage the next sync matches by title again.
	}
}
