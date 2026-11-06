import {
	BOOK_STATUS_LABELS,
	BOOK_STATUSES,
	HALF_STARS_PER_STAR,
	isBookStatus,
} from "@lesefluss/core";

/**
 * The library's structured filter: per facet, the values a book must carry one
 * of (`in`) and the values it must carry none of (`out`). Every facet is a plain
 * value set, dates and progress included (as buckets), so a filter converts
 * one to one into a smart shelf's condition tree.
 */
export const FACETS = [
	"status",
	"tags",
	"author",
	"series",
	"rating",
	"progress",
	"added",
	"lastRead",
] as const;
export type Facet = (typeof FACETS)[number];

export type FacetSelection = { in: string[]; out: string[] };
export type LibraryFilter = Partial<Record<Facet, FacetSelection>>;
export type ValueState = "off" | "in" | "out";

export const FACET_LABELS: Record<Facet, string> = {
	status: "Status",
	tags: "Tag",
	author: "Author",
	series: "Series",
	rating: "Rating",
	progress: "Progress",
	added: "Added",
	lastRead: "Last read",
};

const DAY_MS = 86_400_000;
const DATE_WINDOWS = [
	{ value: "7d", days: 7, label: "Last 7 days" },
	{ value: "30d", days: 30, label: "Last 30 days" },
	{ value: "90d", days: 90, label: "Last 3 months" },
	{ value: "365d", days: 365, label: "Last year" },
] as const;
const NEVER_READ = "never";
const UNRATED = "none";

const PROGRESS_BUCKETS = [
	{ value: "0", label: "Not started" },
	{ value: "1-49", label: "Under half" },
	{ value: "50-99", label: "Half or more" },
	{ value: "100", label: "Read to the end" },
] as const;

/** Values a facet always offers, whatever the library holds. Tags, authors
 *  and series come from the books instead. */
export const FIXED_FACET_VALUES: Partial<
	Record<Facet, readonly { value: string; label: string }[]>
> = {
	status: BOOK_STATUSES.map((s) => ({ value: s, label: BOOK_STATUS_LABELS[s] })),
	rating: [
		...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: n === 1 ? "1 star" : `${n} stars` })),
		{ value: UNRATED, label: "Unrated" },
	],
	progress: PROGRESS_BUCKETS,
	added: DATE_WINDOWS,
	lastRead: [...DATE_WINDOWS, { value: NEVER_READ, label: "Never" }],
};

/** The fields of a library row the filter reads. */
export type FilterFields = {
	status: string;
	tags: readonly string[];
	author: string;
	/** A serial's own id; standalone books have none yet. */
	seriesId: string | null;
	rating: number | null;
	/** 0..100 */
	progress: number;
	addedAt: number;
	lastRead: number | null;
};

export type FacetValues = Record<Facet, readonly string[]>;

function progressBucket(progress: number): string {
	if (progress <= 0) return "0";
	if (progress >= 100) return "100";
	return progress < 50 ? "1-49" : "50-99";
}

function windowsContaining(at: number, now: number): string[] {
	const age = now - at;
	return DATE_WINDOWS.filter((w) => age <= w.days * DAY_MS).map((w) => w.value);
}

/** Every facet value a row carries. Computed once per library change, not per filter. */
export function facetValuesOf(fields: FilterFields, now: number): FacetValues {
	return {
		status: [fields.status],
		tags: fields.tags,
		author: fields.author ? [fields.author] : [],
		series: fields.seriesId ? [fields.seriesId] : [],
		// Ratings count half stars; a 3.5 rounds up into the 4-star value.
		rating: [fields.rating ? String(Math.ceil(fields.rating / HALF_STARS_PER_STAR)) : UNRATED],
		progress: [progressBucket(fields.progress)],
		added: windowsContaining(fields.addedAt, now),
		lastRead: fields.lastRead == null ? [NEVER_READ] : windowsContaining(fields.lastRead, now),
	};
}

/** AND across facets, OR within one facet's included values; an excluded value always removes. */
export function matchesFilter(values: FacetValues, filter: LibraryFilter): boolean {
	for (const facet of FACETS) {
		const selection = filter[facet];
		if (!selection) continue;
		const carried = values[facet];
		if (selection.out.some((v) => carried.includes(v))) return false;
		if (selection.in.length > 0 && !selection.in.some((v) => carried.includes(v))) return false;
	}
	return true;
}

export function valueState(filter: LibraryFilter, facet: Facet, value: string): ValueState {
	const selection = filter[facet];
	if (selection?.in.includes(value)) return "in";
	if (selection?.out.includes(value)) return "out";
	return "off";
}

function withState(
	filter: LibraryFilter,
	facet: Facet,
	value: string,
	state: ValueState,
): LibraryFilter {
	const current = filter[facet] ?? { in: [], out: [] };
	const next: FacetSelection = {
		in: current.in.filter((v) => v !== value),
		out: current.out.filter((v) => v !== value),
	};
	if (state === "in") next.in.push(value);
	if (state === "out") next.out.push(value);
	const { [facet]: _, ...rest } = filter;
	return next.in.length + next.out.length > 0 ? { ...rest, [facet]: next } : rest;
}

const NEXT_STATE: Record<ValueState, ValueState> = { off: "in", in: "out", out: "off" };

/** Off, then include, then exclude, then off again. */
export function cycleValue(filter: LibraryFilter, facet: Facet, value: string): LibraryFilter {
	return withState(filter, facet, value, NEXT_STATE[valueState(filter, facet, value)]);
}

export function removeValue(filter: LibraryFilter, facet: Facet, value: string): LibraryFilter {
	return withState(filter, facet, value, "off");
}

export type FilterChip = { facet: Facet; value: string; isExcluded: boolean };

export function chipsOf(filter: LibraryFilter): FilterChip[] {
	return FACETS.flatMap((facet) => {
		const selection = filter[facet];
		if (!selection) return [];
		return [
			...selection.in.map((value) => ({ facet, value, isExcluded: false })),
			...selection.out.map((value) => ({ facet, value, isExcluded: true })),
		];
	});
}

/** The label of a fixed value; tags and authors are their own label. */
export function fixedValueLabel(facet: Facet, value: string): string | undefined {
	return FIXED_FACET_VALUES[facet]?.find((v) => v.value === value)?.label;
}

/** Drops values of a facet that no row carries any more, e.g. a tag whose last
 *  book lost it, which would otherwise leave an empty library with no visible cause. */
export function pruneFilter(
	filter: LibraryFilter,
	facet: Facet,
	inUse: ReadonlySet<string>,
): LibraryFilter {
	const selection = filter[facet];
	if (!selection) return filter;
	const stale = [...selection.in, ...selection.out].filter((v) => !inUse.has(v));
	return stale.reduce((f, v) => removeValue(f, facet, v), filter);
}

export const FILTER_STORAGE_KEY = "lesefluss:library-filter-v2";
const LEGACY_STATUS_KEY = "lesefluss:library-filter";
const LEGACY_TAG_KEY = "lesefluss:library-tag";
const FILTER_VERSION = 1;

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function serializeFilter(filter: LibraryFilter): string {
	return JSON.stringify({ v: FILTER_VERSION, facets: filter });
}

/** Unknown facets and malformed values are dropped, not guessed at. */
export function parseFilter(raw: string | null): LibraryFilter | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const { v, facets } = parsed as { v?: unknown; facets?: unknown };
	if (v !== FILTER_VERSION || typeof facets !== "object" || facets === null) return null;
	const filter: LibraryFilter = {};
	for (const facet of FACETS) {
		const selection = (facets as Record<string, unknown>)[facet];
		if (typeof selection !== "object" || selection === null) continue;
		const { in: included, out } = selection as { in?: unknown; out?: unknown };
		const next = { in: stringList(included), out: stringList(out) };
		if (next.in.length + next.out.length > 0) filter[facet] = next;
	}
	return filter;
}

/** The filter as the last session left it, from the v2 key or the old status and tag keys. */
export function loadFilter(storage: Pick<Storage, "getItem">): LibraryFilter {
	const stored = parseFilter(storage.getItem(FILTER_STORAGE_KEY));
	if (stored) return stored;
	const filter: LibraryFilter = {};
	const status = storage.getItem(LEGACY_STATUS_KEY);
	if (status && isBookStatus(status)) filter.status = { in: [status], out: [] };
	const tag = storage.getItem(LEGACY_TAG_KEY);
	if (tag) filter.tags = { in: [tag], out: [] };
	return filter;
}
