import { BOOK_STATUS_LABELS, BOOK_STATUSES, isSeriesCollectionId } from "@lesefluss/core";
import type { SeriesMembership } from "../../services/db/queries/collections";
import { compareText, type LibraryItem } from "./sort-filter";

export type GroupBy = "none" | "author" | "series" | "tag" | "status" | "collection";

export const GROUP_OPTIONS: readonly GroupBy[] = [
	"none",
	"author",
	"series",
	"tag",
	"status",
	"collection",
];

export const GROUP_LABELS: Record<GroupBy, string> = {
	none: "None",
	author: "Author",
	series: "Series",
	tag: "Tag",
	status: "Status",
	collection: "Collection",
};

export const isGroupBy = (value: string): value is GroupBy =>
	(GROUP_OPTIONS as readonly string[]).includes(value);

export type LibraryGroup = { key: string; label: string; items: LibraryItem[] };

/** Book id → its series collections with #N, in sidebar order. */
export type SeriesMemberships = ReadonlyMap<string, readonly SeriesMembership[]>;

export type GroupContext = {
	/** Live collections in sidebar order. */
	collections: readonly { id: string; name: string }[];
	seriesMemberships: SeriesMemberships;
};

/** The key of the "Unknown author" / "No tags" / "No series" group. */
const OTHERS = "";

const OTHERS_LABEL: Record<Exclude<GroupBy, "none" | "status">, string> = {
	author: "Unknown author",
	series: "No series",
	tag: "No tags",
	collection: "Not in a collection",
};

export const itemKey = (item: LibraryItem) =>
	item.kind === "book" ? item.book.id : item.series.id;

/** The #N a book shows: the one of its first series collection in sidebar order. */
export function seriesBadge(bookId: string, memberships: SeriesMemberships): number | null {
	return memberships.get(bookId)?.[0]?.seriesIndex ?? null;
}

function seriesIndexIn(
	memberships: SeriesMemberships,
	item: LibraryItem,
	collectionId: string,
): number | null {
	if (item.kind !== "book") return null;
	const m = memberships.get(item.book.id)?.find((x) => x.collectionId === collectionId);
	return m?.seriesIndex ?? null;
}

function keysOf(
	item: LibraryItem,
	groupBy: GroupBy,
	known: ReadonlySet<string>,
): readonly string[] {
	switch (groupBy) {
		case "author":
			return [item.sortKey.author.trim().toLocaleLowerCase() || OTHERS];
		case "status":
			return [item.sortKey.status];
		case "tag":
			return item.sortKey.tags.length > 0 ? item.sortKey.tags : [OTHERS];
		case "collection": {
			// Series collections have Group by Series; the Collection filter still matches them.
			const ids = item.facets.collection.filter((id) => known.has(id) && !isSeriesCollectionId(id));
			return ids.length > 0 ? ids : [OTHERS];
		}
		case "series": {
			// A serial's own id sits in this facet too; only series collections group here.
			const ids = item.kind === "book" ? item.facets.series.filter((id) => known.has(id)) : [];
			return ids.length > 0 ? ids : [OTHERS];
		}
		case "none":
			return [OTHERS];
	}
}

/**
 * The view's items in sections, each in the order given (the user's sort),
 * except a series section, which runs by #N with unnumbered books last. A
 * book in several tags, collections or series shows in each of them. Null
 * for `none`.
 */
export function groupLibrary(
	items: readonly LibraryItem[],
	groupBy: GroupBy,
	ctx: GroupContext,
): LibraryGroup[] | null {
	if (groupBy === "none") return null;
	const names = new Map(ctx.collections.map((c) => [c.id, c.name]));
	const known = new Set(names.keys());
	const buckets = new Map<string, LibraryItem[]>();
	// An author group shows the spelling its first book has.
	const authorNames = new Map<string, string>();
	for (const item of items) {
		for (const key of keysOf(item, groupBy, known)) {
			const bucket = buckets.get(key);
			if (bucket) bucket.push(item);
			else {
				buckets.set(key, [item]);
				if (groupBy === "author") authorNames.set(key, item.sortKey.author.trim());
			}
		}
	}

	if (groupBy === "status") {
		return BOOK_STATUSES.filter((s) => buckets.has(s)).map((s) => ({
			key: s,
			label: BOOK_STATUS_LABELS[s],
			items: buckets.get(s) ?? [],
		}));
	}

	const labelOf = (key: string) =>
		groupBy === "author"
			? (authorNames.get(key) ?? key)
			: groupBy === "tag"
				? key
				: (names.get(key) ?? key);
	const keys = [...buckets.keys()].filter((k) => k !== OTHERS);
	if (groupBy === "collection") {
		const order = new Map(ctx.collections.map((c, i) => [c.id, i]));
		keys.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
	} else {
		keys.sort((a, b) => compareText(labelOf(a), labelOf(b)));
	}

	const groups = keys.map((key) => {
		const bucket = buckets.get(key) ?? [];
		if (groupBy === "series") {
			const at = (item: LibraryItem) =>
				seriesIndexIn(ctx.seriesMemberships, item, key) ?? Number.POSITIVE_INFINITY;
			bucket.sort((a, b) => at(a) - at(b));
		}
		return { key, label: labelOf(key), items: bucket };
	});
	const others = buckets.get(OTHERS);
	if (others) groups.push({ key: OTHERS, label: OTHERS_LABEL[groupBy], items: others });
	return groups;
}

export type GridRow =
	| { type: "header"; group: LibraryGroup; collapsed: boolean }
	| { type: "items"; key: string; items: LibraryItem[] };

/**
 * The flat list the virtualizer windows over. Rows are chunked per group, so
 * a group never shares a row with the next, and a collapsed group keeps only
 * its heading.
 */
export function layoutRows(
	items: readonly LibraryItem[],
	groups: readonly LibraryGroup[] | null,
	cols: number,
	collapsed: ReadonlySet<string>,
): GridRow[] {
	const rows: GridRow[] = [];
	const chunk = (list: readonly LibraryItem[], prefix: string) => {
		for (let i = 0; i < list.length; i += cols) {
			const slice = list.slice(i, i + cols);
			rows.push({ type: "items", key: `${prefix}${slice.map(itemKey).join()}`, items: slice });
		}
	};
	if (!groups) {
		chunk(items, "");
		return rows;
	}
	for (const group of groups) {
		const isCollapsed = collapsed.has(group.key);
		rows.push({ type: "header", group, collapsed: isCollapsed });
		if (!isCollapsed) chunk(group.items, `${group.key}\u0000`);
	}
	return rows;
}

/**
 * The items as the grouped view shows them, each once: selection ranges and
 * Set #N follow what is on screen. Books seen only in collapsed groups go
 * last, so a range between two shown books never takes them in.
 */
export function displayOrder(
	items: readonly LibraryItem[],
	groups: readonly LibraryGroup[] | null,
	collapsed: ReadonlySet<string>,
): readonly LibraryItem[] {
	if (!groups) return items;
	const seen = new Set<string>();
	const order: LibraryItem[] = [];
	const take = (item: LibraryItem) => {
		const key = itemKey(item);
		if (seen.has(key)) return;
		seen.add(key);
		order.push(item);
	};
	for (const g of groups) if (!collapsed.has(g.key)) g.items.forEach(take);
	for (const g of groups) if (collapsed.has(g.key)) g.items.forEach(take);
	return order;
}

export function parseCollapsed(raw: string): Set<string> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (Array.isArray(parsed)) return new Set(parsed.filter((k) => typeof k === "string"));
	} catch {
		// a hand-edited or old value: nothing collapsed
	}
	return new Set();
}

export function toggleCollapsed(raw: string, key: string): string {
	const next = parseCollapsed(raw);
	if (!next.delete(key)) next.add(key);
	return JSON.stringify([...next]);
}
