/**
 * Which library book a single-book device's position belongs to. The device
 * names its book by `book_hash`, the library id the book was sent under, and
 * newer firmware also by the title it was sent with. The device decides, never
 * the app's remembered active book. A re-import gives the book a new id, so the
 * hash alone loses it; the title finds it again.
 */
export type SingleBookSyncTarget =
	| { kind: "none"; staleActiveId: string | null }
	| { kind: "unknown"; deviceHash: string; staleActiveId: string | null }
	| { kind: "sync"; bookId: string; restored: boolean; matchedByTitle: boolean };

export type SingleBookDeviceBook = { hash: string; title?: string };
export type LibraryBookRef = { id: string; title: string };

/**
 * The transfer sends titles ASCII-only with colons replaced, so both sides are
 * reduced to lowercase ASCII letters and digits before they are compared.
 */
export function normalizeDeviceTitle(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// A mostly non-Latin title collapses to a few digits ("Том 1" → "1"), which
// would match unrelated books.
const MIN_TITLE_LETTERS = 3;

function titleKey(title: string | undefined): string {
	const key = title ? normalizeDeviceTitle(title) : "";
	return (key.match(/[a-z]/g)?.length ?? 0) >= MIN_TITLE_LETTERS ? key : "";
}

export function resolveSingleBookSyncTarget(
	device: SingleBookDeviceBook,
	activeBookId: string | null,
	library: readonly LibraryBookRef[],
	links: Readonly<Record<string, string>> = {},
): SingleBookSyncTarget {
	const { hash } = device;
	if (!hash) return { kind: "none", staleActiveId: activeBookId };

	const sync = (bookId: string, matchedByTitle: boolean): SingleBookSyncTarget => ({
		kind: "sync",
		bookId,
		restored: activeBookId !== bookId,
		matchedByTitle,
	});

	if (library.some((b) => b.id === hash)) return sync(hash, false);

	const linked = library.find((b) => b.id === links[hash]);
	if (linked) return sync(linked.id, false);

	const wanted = titleKey(device.title);
	if (wanted) {
		const matches = library.filter((b) => normalizeDeviceTitle(b.title) === wanted);
		if (matches.length === 1) return sync(matches[0].id, true);
	}

	return { kind: "unknown", deviceHash: hash, staleActiveId: activeBookId };
}
