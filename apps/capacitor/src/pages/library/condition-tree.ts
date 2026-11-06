import { FACETS, type Facet, type FacetValues, type LibraryFilter } from "./filter-model";

/**
 * A smart shelf's conditions. Stored as a tree from the start so the nested
 * AND/OR editor (LESE-125.12) needs no data migration. Every client evaluates
 * any tree; a field or operator it does not know matches no book, so an older
 * client shows a shelf from a newer one as too small, never as too big.
 */
export type Condition = { field: string; op: string; value: unknown };
export type ConditionGroup = { op: "and" | "or"; items: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;
export type ConditionTree = { v: 1; root: ConditionGroup };

const TREE_VERSION = 1;
// Deeper than any editor builds; a crafted tree must not overflow the stack.
const MAX_DEPTH = 32;

const isFacet = (field: string): field is Facet => (FACETS as readonly string[]).includes(field);

export function isGroup(node: ConditionNode): node is ConditionGroup {
	return "items" in node;
}

/** AND across facets, OR within a facet's included values (AND in tags "all" mode),
 *  one `not` per excluded value: the same rules as `matchesFilter`. */
export function filterToTree(filter: LibraryFilter): ConditionTree {
	const items: ConditionNode[] = [];
	for (const facet of FACETS) {
		const selection = filter[facet];
		if (!selection) continue;
		const included = selection.in.map((value) => ({ field: facet, op: "is", value }));
		if (selection.mode === "all" || included.length === 1) items.push(...included);
		else if (included.length > 1) items.push({ op: "or", items: included });
		for (const value of selection.out) items.push({ field: facet, op: "not", value });
	}
	if (filter.words?.min != null) items.push({ field: "words", op: "gte", value: filter.words.min });
	if (filter.words?.max != null) items.push({ field: "words", op: "lte", value: filter.words.max });
	return { v: TREE_VERSION, root: { op: "and", items } };
}

/**
 * The chips a tree stands for, or null when the chip row cannot show it
 * (an unknown field or operator, a nested group, an OR across facets).
 */
export function treeToFilter(tree: ConditionTree): LibraryFilter | null {
	if (tree.root.op !== "and") return null;
	const filter: LibraryFilter = {};
	const direct = new Map<Facet, string[]>();
	const anyOf = new Map<Facet, string[]>();
	const out = new Map<Facet, string[]>();
	const push = (map: Map<Facet, string[]>, facet: Facet, value: string) =>
		map.set(facet, [...(map.get(facet) ?? []), value]);

	for (const node of tree.root.items) {
		if (isGroup(node)) {
			if (node.op !== "or" || node.items.length === 0) return null;
			const first = node.items[0];
			if (isGroup(first) || !isFacet(first.field) || anyOf.has(first.field)) return null;
			const facet = first.field;
			for (const item of node.items) {
				if (isGroup(item) || item.field !== facet || item.op !== "is") return null;
				if (typeof item.value !== "string") return null;
				push(anyOf, facet, item.value);
			}
			continue;
		}
		if (node.field === "words") {
			if (typeof node.value !== "number" || !Number.isFinite(node.value)) return null;
			const bound = node.op === "gte" ? "min" : node.op === "lte" ? "max" : null;
			if (!bound || filter.words?.[bound] != null) return null;
			filter.words = { ...filter.words, [bound]: node.value };
			continue;
		}
		if (!isFacet(node.field) || typeof node.value !== "string") return null;
		if (node.op === "is") push(direct, node.field, node.value);
		else if (node.op === "not") push(out, node.field, node.value);
		else return null;
	}

	for (const facet of FACETS) {
		const all = direct.get(facet) ?? [];
		const any = anyOf.get(facet) ?? [];
		const excluded = out.get(facet) ?? [];
		if (all.length > 0 && any.length > 0) return null;
		// Several values that must all be carried: only tags have a chip mode for that.
		if (all.length > 1 && facet !== "tags") return null;
		const included = all.length > 0 ? all : any;
		if (included.length + excluded.length === 0) continue;
		filter[facet] = {
			in: included,
			out: excluded,
			...(all.length > 1 && { mode: "all" as const }),
		};
	}
	const { words } = filter;
	if (words?.min != null && words.max != null && words.min > words.max) return null;
	return filter;
}

function matchesCondition(values: FacetValues, cond: Condition): boolean {
	if (cond.field === "words") {
		const { wordCount } = values;
		if (wordCount == null || typeof cond.value !== "number") return false;
		if (cond.op === "gte") return wordCount >= cond.value;
		if (cond.op === "lte") return wordCount <= cond.value;
		return false;
	}
	if (!isFacet(cond.field) || typeof cond.value !== "string") return false;
	const carried = values[cond.field].includes(cond.value);
	if (cond.op === "is") return carried;
	if (cond.op === "not") return !carried;
	return false;
}

export function matchesTree(values: FacetValues, group: ConditionGroup, depth = 0): boolean {
	if (depth > MAX_DEPTH) return false;
	const matches = (node: ConditionNode) =>
		isGroup(node) ? matchesTree(values, node, depth + 1) : matchesCondition(values, node);
	if (group.op === "and") return group.items.every(matches);
	if (group.op === "or") return group.items.some(matches);
	return false;
}

function parseNode(raw: unknown, depth: number): ConditionNode | null {
	if (typeof raw !== "object" || raw === null || depth > MAX_DEPTH) return null;
	const { op, items, field, value } = raw as Record<string, unknown>;
	if (typeof op !== "string") return null;
	if (Array.isArray(items)) {
		const nodes: ConditionNode[] = [];
		for (const item of items) {
			const node = parseNode(item, depth + 1);
			// Kept as a condition that matches nothing, so the tree stays as strict as written.
			nodes.push(node ?? { field: "", op: "", value: null });
		}
		// An unknown group operator is kept; `matchesTree` matches nothing for it.
		return { op: op as ConditionGroup["op"], items: nodes };
	}
	if (typeof field !== "string") return null;
	return { field, op, value };
}

/** null for anything that is not a version-1 tree with a group at its root. */
export function parseTree(raw: string): ConditionTree | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const { v, root } = parsed as { v?: unknown; root?: unknown };
	if (v !== TREE_VERSION) return null;
	const node = parseNode(root, 0);
	return node && isGroup(node) ? { v: TREE_VERSION, root: node } : null;
}

export function serializeTree(tree: ConditionTree): string {
	return JSON.stringify(tree);
}
