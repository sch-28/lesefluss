export type NumberingMode = "append" | "fromOne" | "clear";

/** The highest #N in a collection, 0 when nothing is numbered. */
export function highestNumber(members: ReadonlyMap<string, number | null>): number {
	let highest = 0;
	for (const index of members.values()) if (index !== null && index > highest) highest = index;
	return highest;
}

/**
 * The #N each book gets, keyed in the order given (the view's).
 *
 * `append` keeps a member's number and numbers the rest after the highest
 * whole number, so after a 2.5 the next is 3. `fromOne` renumbers 1..N, and
 * `clear` drops the numbers while the books stay in the collection.
 */
export function planSeriesNumbers(
	bookIds: readonly string[],
	members: ReadonlyMap<string, number | null>,
	mode: NumberingMode,
): Map<string, number | null> {
	const ids = [...new Set(bookIds)];
	if (mode === "clear") return new Map(ids.map((id) => [id, null]));
	if (mode === "fromOne") return new Map(ids.map((id, i) => [id, i + 1]));
	let next = Math.floor(highestNumber(members)) + 1;
	return new Map(
		ids.map((id) => {
			const kept = members.get(id);
			return [id, kept ?? next++];
		}),
	);
}

export function formatSeriesNumber(index: number): string {
	return `#${index}`;
}
