export type TombstoneCounts = {
	books: number;
	highlights: number;
	bookmarks: number;
	wishlist: number;
};

export type UserTombstoneCounts = TombstoneCounts & { userId: string };

export const NO_TOMBSTONES: TombstoneCounts = {
	books: 0,
	highlights: 0,
	bookmarks: 0,
	wishlist: 0,
};

/** `scope` is a user id, or "all" for everyone. */
export function tombstoneCountsInScope(
	byUser: readonly UserTombstoneCounts[],
	scope: string,
): TombstoneCounts {
	const counts = { ...NO_TOMBSTONES };
	for (const row of byUser) {
		if (scope !== "all" && row.userId !== scope) continue;
		counts.books += row.books;
		counts.highlights += row.highlights;
		counts.bookmarks += row.bookmarks;
		counts.wishlist += row.wishlist;
	}
	return counts;
}

export function tombstoneTotal(counts: TombstoneCounts): number {
	return counts.books + counts.highlights + counts.bookmarks + counts.wishlist;
}

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

export function describeTombstoneCounts(counts: TombstoneCounts): string {
	return [
		plural(counts.books, "book", "books"),
		plural(counts.highlights, "highlight", "highlights"),
		plural(counts.bookmarks, "bookmark", "bookmarks"),
		plural(counts.wishlist, "wishlist item", "wishlist items"),
	].join(", ");
}
