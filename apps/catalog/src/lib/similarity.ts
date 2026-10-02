/** The broadest tags (Fiction, Travel, Biography...) say too little to pair books on their own. */
const GENERIC_TAG_COUNT = 5;

export type TagWeight = { id: string; weight: number };

/**
 * Inverse-document-frequency weights for a book's tags: a tag few books share
 * says more about them than one half the catalog has. Returns only the weights
 * worth matching on, plus the specific (non-generic) ones of which a candidate
 * must share at least one.
 */
export function similarityWeights(
	bookTags: readonly string[],
	counts: ReadonlyMap<string, number>,
	totalBooks: number,
): { weights: TagWeight[]; specific: string[] } {
	const generic = new Set(
		[...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, GENERIC_TAG_COUNT)
			.map(([id]) => id),
	);
	const weights = bookTags
		.filter((id) => (counts.get(id) ?? 0) > 0)
		.map((id) => ({ id, weight: Math.log(1 + totalBooks / (counts.get(id) ?? 1)) }));
	return { weights, specific: weights.map((w) => w.id).filter((id) => !generic.has(id)) };
}
