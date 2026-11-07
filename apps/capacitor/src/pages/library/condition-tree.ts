import { HALF_STARS_PER_STAR } from "@lesefluss/core";
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

export type NumberRange = { min: number; max: number };

const isNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

export function isNumberRange(value: unknown): value is NumberRange {
	if (typeof value !== "object" || value === null) return false;
	const { min, max } = value as Record<string, unknown>;
	return isNumber(min) && isNumber(max);
}

/** Local midnight of a `YYYY-MM-DD` day plus `days`; null for anything that is no real date. */
export function localDayStart(value: unknown, days = 0): number | null {
	if (typeof value !== "string") return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
	const date = new Date(year, month, day);
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
		return null;
	}
	date.setDate(day + days);
	return date.getTime();
}

function compareNumber(n: number | null, op: string, value: unknown): boolean {
	if (n == null) return false;
	if (op === "gte") return isNumber(value) && n >= value;
	if (op === "lte") return isNumber(value) && n <= value;
	if (op === "between") {
		if (!isNumberRange(value)) return false;
		return n >= Math.min(value.min, value.max) && n <= Math.max(value.min, value.max);
	}
	return false;
}

// Whole local days, so a shelf holds the same books all day and the sidebar
// count, taken at another moment, agrees with the page.
function compareDate(at: number | null, op: string, value: unknown, now: number): boolean {
	if (at == null) return false;
	if (op === "within") {
		if (!isNumber(value) || value < 0) return false;
		const from = new Date(now);
		from.setHours(0, 0, 0, 0);
		from.setDate(from.getDate() - value);
		return at >= from.getTime();
	}
	if (op === "before") {
		const start = localDayStart(value);
		return start != null && at < start;
	}
	if (op === "after") {
		const end = localDayStart(value, 1);
		return end != null && at >= end;
	}
	return false;
}

function compareText(text: string, op: string, value: unknown): boolean {
	if (typeof value !== "string" || value.trim() === "") return false;
	const found = text.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase());
	if (op === "contains") return found;
	if (op === "notContains") return !found;
	return false;
}

function isEmpty(values: FacetValues, field: string): boolean {
	switch (field) {
		case "tags":
		case "author":
		case "series":
		case "collection":
			return values[field].length === 0;
		case "rating":
			return !values.raw.rating;
		case "lastRead":
			return values.raw.lastRead == null;
		case "words":
			return values.wordCount == null;
		default:
			return false;
	}
}

const NUMBER_OPS = new Set(["gte", "lte", "between"]);
const DATE_OPS = new Set(["within", "before", "after"]);
const TEXT_OPS = new Set(["contains", "notContains"]);

function matchesCondition(values: FacetValues, cond: Condition, now: number): boolean {
	const { field, op, value } = cond;
	const { raw } = values;
	if (op === "empty") return isEmpty(values, field);
	if (field === "words") return compareNumber(values.wordCount, op, value);
	if (field === "title") return compareText(raw.title, op, value);
	if (field === "author" && TEXT_OPS.has(op)) return compareText(raw.author, op, value);
	if (field === "rating" && NUMBER_OPS.has(op)) {
		return compareNumber(raw.rating ? raw.rating / HALF_STARS_PER_STAR : null, op, value);
	}
	if (field === "progress" && NUMBER_OPS.has(op)) return compareNumber(raw.progress, op, value);
	if (field === "added" && DATE_OPS.has(op)) return compareDate(raw.addedAt, op, value, now);
	if (field === "lastRead" && DATE_OPS.has(op)) return compareDate(raw.lastRead, op, value, now);
	if (!isFacet(field) || typeof value !== "string") return false;
	const carried = values[field].includes(value);
	if (op === "is") return carried;
	if (op === "not") return !carried;
	return false;
}

function matchesGroup(values: FacetValues, group: ConditionGroup, now: number, depth: number) {
	if (depth > MAX_DEPTH) return false;
	const matches = (node: ConditionNode): boolean =>
		isGroup(node)
			? matchesGroup(values, node, now, depth + 1)
			: matchesCondition(values, node, now);
	if (group.op === "and") return group.items.every(matches);
	if (group.op === "or") return group.items.some(matches);
	return false;
}

/** `now` anchors the relative dates; a shelf evaluates them on the day it is shown. */
export function matchesTree(values: FacetValues, group: ConditionGroup, now = Date.now()): boolean {
	return matchesGroup(values, group, now, 0);
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
