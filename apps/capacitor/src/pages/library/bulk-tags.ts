/**
 * Editing tags across a selection.
 *
 * A tag can be on all, some, or none of the picked books, and the reader edits
 * an *intent* per tag rather than a state: "add this to everything" and "take
 * this off everything" are the two things a multi-book edit is for, and both
 * have to be expressible whatever the current mix is.
 *
 * Pure, so the cycle and the per-book patch are testable without a sheet.
 */

import { parseBookTags, serializeBookTags } from "@lesefluss/core";
import type { TagPatch } from "../../services/db/hooks/use-bulk-books";
import type { Book } from "../../services/db/schema";
import { clampBookTags } from "./book-fields";

/** How many of the selected books carry a tag. */
export type TagState = "all" | "some" | "none";

/** What the reader wants done with a tag when they apply. */
export type TagIntent = "add" | "remove" | "leave";

export type TagRow = {
	tag: string;
	state: TagState;
	/** Selected books carrying it, for the "3 of 12" hint. */
	count: number;
};

/**
 * Every tag the sheet offers: the ones on the selection, plus the rest of the
 * library's, so an existing tag can be applied without retyping it.
 */
export function tagRows(selected: readonly Book[], libraryTags: readonly string[]): TagRow[] {
	const counts = new Map<string, number>();
	for (const book of selected) {
		for (const tag of new Set(parseBookTags(book.tags))) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	for (const tag of libraryTags) if (!counts.has(tag)) counts.set(tag, 0);

	return [...counts.entries()]
		.map(([tag, count]) => ({
			tag,
			count,
			state: (count === 0 ? "none" : count === selected.length ? "all" : "some") as TagState,
		}))
		.sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * The next intent when a row is tapped, cycling through leave.
 *
 * The first tap always does the obvious thing: add it where it is missing, take
 * it off where everything already has it.
 */
export function nextIntent(state: TagState, current: TagIntent): TagIntent {
	const [first, second]: TagIntent[] = state === "all" ? ["remove", "add"] : ["add", "remove"];
	if (current === "leave") return first;
	if (current === first) return second;
	return "leave";
}

/**
 * One book's tags after the intents are applied, preserving its existing order.
 * Removals happen first so a tag that is both removed and re-added ends up at
 * the end rather than in its old position.
 */
export function applyTagIntents(
	current: readonly string[],
	intents: ReadonlyMap<string, TagIntent>,
): string[] {
	const kept = current.filter((tag) => intents.get(tag) !== "remove");
	const added = [...intents.entries()]
		.filter(([tag, intent]) => intent === "add" && !kept.includes(tag))
		.map(([tag]) => tag);
	return [...kept, ...added];
}

export function tagPatchFor(
	book: Pick<Book, "tags">,
	intents: ReadonlyMap<string, TagIntent>,
): TagPatch {
	const current = parseBookTags(book.tags);
	const next = applyTagIntents(current, intents);

	if (next.length === current.length && next.every((tag, i) => tag === current[i])) {
		return { kind: "unchanged" };
	}

	// Only an addition can overflow. A book already past the cap must still be
	// allowed to shrink, or the one action that could bring it back under the
	// limit would be the one thing refused.
	const isAdding = next.some((tag) => !current.includes(tag));
	// All-or-nothing per book: applying one of two requested tags is harder to
	// explain, and to retry, than leaving the book alone and saying so.
	if (isAdding && clampBookTags(next).dropped.length > 0) return { kind: "overflow" };

	return { kind: "write", tags: serializeBookTags(next) };
}

/** True once at least one row would do something, which is what enables Apply. */
export function hasPendingIntent(intents: ReadonlyMap<string, TagIntent>): boolean {
	return [...intents.values()].some((intent) => intent !== "leave");
}
