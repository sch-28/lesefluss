import type { SmartShelf } from "../../services/db/schema";
import {
	type ConditionTree,
	filterToTree,
	matchesTree,
	parseTree,
	treeToFilter,
} from "./condition-tree";
import type { FacetValues, LibraryFilter } from "./filter-model";

export type ShelfEntry = {
	id: string;
	name: string;
	/** null when the stored conditions cannot be read: such a shelf shows no books. */
	tree: ConditionTree | null;
	/** The chips the shelf opens with; null when they cannot show its conditions. */
	filter: LibraryFilter | null;
	pinned: boolean;
	isBuiltIn: boolean;
	sortOrder: number;
};

const BUILT_IN_PREFIX = "builtin:";

/** Code, not rows: they never sync, so no device can delete or rename them. */
const BUILT_INS: readonly { id: string; name: string; filter: LibraryFilter }[] = [
	{
		id: `${BUILT_IN_PREFIX}reading`,
		name: "Reading",
		filter: { status: { in: ["reading"], out: [] } },
	},
	{
		id: `${BUILT_IN_PREFIX}finished`,
		name: "Finished",
		filter: { status: { in: ["finished"], out: [] } },
	},
	{
		id: `${BUILT_IN_PREFIX}unrated`,
		name: "Unrated",
		filter: { status: { in: ["finished"], out: [] }, rating: { in: ["none"], out: [] } },
	},
];

export const isBuiltInShelfId = (id: string) => id.startsWith(BUILT_IN_PREFIX);

export function builtInShelves(pinnedIds: ReadonlySet<string>): ShelfEntry[] {
	return BUILT_INS.map((b, i) => ({
		id: b.id,
		name: b.name,
		tree: filterToTree(b.filter),
		filter: b.filter,
		pinned: pinnedIds.has(b.id),
		isBuiltIn: true,
		// Ahead of the user's shelves, whose sort orders start at 1.
		sortOrder: i - BUILT_INS.length,
	}));
}

export function shelfEntryOf(row: SmartShelf): ShelfEntry {
	const tree = parseTree(row.conditions);
	return {
		id: row.id,
		name: row.name,
		tree,
		filter: tree ? treeToFilter(tree) : null,
		pinned: row.pinned,
		isBuiltIn: false,
		sortOrder: row.sortOrder,
	};
}

/** Pinned first, then the stored order, then the name. */
export function orderShelves(shelves: ShelfEntry[]): ShelfEntry[] {
	return [...shelves].sort(
		(a, b) =>
			Number(b.pinned) - Number(a.pinned) ||
			a.sortOrder - b.sortOrder ||
			a.name.localeCompare(b.name),
	);
}

/** Every shelf's count in one pass over the library. */
export function shelfCounts(
	shelves: readonly ShelfEntry[],
	items: readonly { facets: FacetValues }[],
): Map<string, number> {
	const counts = new Map(shelves.map((s) => [s.id, 0]));
	for (const { facets } of items) {
		for (const shelf of shelves) {
			if (shelf.tree && matchesTree(facets, shelf.tree.root)) {
				counts.set(shelf.id, (counts.get(shelf.id) ?? 0) + 1);
			}
		}
	}
	return counts;
}

export const BUILT_IN_PINS_KEY = "lesefluss:builtin-shelf-pins";

export function parseBuiltInPins(raw: string | null): Set<string> {
	if (!raw) return new Set();
	try {
		const parsed: unknown = JSON.parse(raw);
		return new Set(
			Array.isArray(parsed)
				? parsed.filter((id): id is string => typeof id === "string" && isBuiltInShelfId(id))
				: [],
		);
	} catch {
		return new Set();
	}
}
