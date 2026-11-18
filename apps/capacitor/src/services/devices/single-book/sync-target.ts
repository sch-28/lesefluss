/**
 * Which library book a single-book device's position belongs to. The device
 * names its book only by `book_hash`, the library id the book was sent under,
 * so the device's hash decides, never the app's remembered active book.
 */
export type SingleBookSyncTarget =
	| { kind: "none"; staleActiveId: string | null }
	| { kind: "unknown"; deviceHash: string; staleActiveId: string | null }
	| { kind: "sync"; bookId: string; restored: boolean };

export function resolveSingleBookSyncTarget(
	deviceHash: string,
	activeBookId: string | null,
	libraryIds: readonly string[],
): SingleBookSyncTarget {
	if (deviceHash && libraryIds.includes(deviceHash)) {
		return { kind: "sync", bookId: deviceHash, restored: activeBookId !== deviceHash };
	}
	if (!deviceHash) return { kind: "none", staleActiveId: activeBookId };
	return { kind: "unknown", deviceHash, staleActiveId: activeBookId };
}
