import { serializeBookTags } from "@lesefluss/core";

/**
 * Field caps, mirroring `SyncBookSchema`. The server validates the whole push
 * payload in one `safeParse`, so a single over-long field does not fail its own
 * book: it 400s the entire snapshot, silently stopping sync for books,
 * highlights, glossary, settings and sessions alike. Enforcing the same limits
 * at the input keeps a paste from doing that.
 */
export const FIELD_LIMITS = {
	title: 500,
	author: 200,
	description: 20_000,
	review: 20_000,
	language: 35,
	tagsJson: 2000,
} as const;

/**
 * The longest prefix of `tags` whose serialized form still fits the cap, plus
 * whatever had to be left out.
 *
 * Greedy and order-preserving: appends until the JSON would overflow, then
 * stops. Anything added at the end is therefore the first thing dropped, which
 * is what a bulk tag-add wants to hear about.
 */
export function clampBookTags(tags: readonly string[]): { tags: string[]; dropped: string[] } {
	const kept: string[] = [];
	for (const [index, tag] of tags.entries()) {
		kept.push(tag);
		if ((serializeBookTags(kept)?.length ?? 0) > FIELD_LIMITS.tagsJson) {
			kept.pop();
			return { tags: kept, dropped: [...tags.slice(index)] };
		}
	}
	return { tags: kept, dropped: [] };
}
