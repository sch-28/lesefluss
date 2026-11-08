export type NumberingMode = "append" | "fromOne" | "clear";

/** The highest #N in a collection, 0 when nothing is numbered. */
export function highestNumber(members: ReadonlyMap<string, number | null>): number {
	let highest = 0;
	for (const index of members.values()) if (index !== null && index > highest) highest = index;
	return highest;
}

/** The number a book added to the series gets: after the highest whole one. */
export function nextSeriesNumber(members: ReadonlyMap<string, number | null>): number {
	return Math.floor(highestNumber(members)) + 1;
}

/**
 * The #N each book gets, keyed in the order given (the view's).
 *
 * `append` keeps a member's number and numbers the rest after the highest
 * whole number, so after a 2.5 the next is 3. `fromOne` renumbers from 1,
 * stepping over the numbers members outside the selection hold, and `clear`
 * drops the numbers while the books stay in the collection.
 */
export function planSeriesNumbers(
	bookIds: readonly string[],
	members: ReadonlyMap<string, number | null>,
	mode: NumberingMode,
): Map<string, number | null> {
	const ids = [...new Set(bookIds)];
	if (mode === "clear") return new Map(ids.map((id) => [id, null]));
	if (mode === "fromOne") {
		const picked = new Set(ids);
		const held = new Set<number>();
		for (const [id, index] of members) if (index !== null && !picked.has(id)) held.add(index);
		let n = 0;
		return new Map(
			ids.map((id) => {
				n++;
				while (held.has(n)) n++;
				return [id, n];
			}),
		);
	}
	let next = nextSeriesNumber(members);
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

/**
 * Numbers a planned book would share with another book once `numbers` lands.
 * Two members outside the plan may already share one (editions, omnibuses);
 * the step cannot edit them, so that is not a collision of the plan's.
 */
export function duplicateNumbers(
	numbers: ReadonlyMap<string, number | null>,
	members: ReadonlyMap<string, number | null>,
): Set<number> {
	const planned = new Map<number, number>();
	for (const index of numbers.values()) {
		if (index !== null) planned.set(index, (planned.get(index) ?? 0) + 1);
	}
	const duplicates = new Set<number>();
	for (const [index, n] of planned) if (n > 1) duplicates.add(index);
	for (const [id, index] of members) {
		if (index !== null && !numbers.has(id) && planned.has(index)) duplicates.add(index);
	}
	return duplicates;
}

/** A typed #N: empty is no number, anything else must be a positive number. */
export function parseSeriesNumber(text: string): number | null | undefined {
	const trimmed = text.trim().replace(/^#/, "").replace(",", ".");
	if (trimmed === "") return null;
	const value = Number(trimmed);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}
