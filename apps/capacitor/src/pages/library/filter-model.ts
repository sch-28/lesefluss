import {
	BOOK_STATUS_LABELS,
	BOOK_STATUSES,
	HALF_STARS_PER_STAR,
	isBookStatus,
	isSeriesCollectionId,
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
	"collection",
	"rating",
	"progress",
	"added",
	"lastRead",
] as const;
export type Facet = (typeof FACETS)[number];

/** `mode: "all"` (tags only) requires every included value instead of one of them. */
export type FacetSelection = { in: string[]; out: string[]; mode?: "all" };
/** Inclusive bounds in words; either end may be open. */
export type WordRange = { min?: number; max?: number };
export type LibraryFilter = Partial<Record<Facet, FacetSelection>> & { words?: WordRange };
export type ValueState = "off" | "in" | "out";

export const FACET_LABELS: Record<Facet, string> = {
	status: "Status",
	tags: "Tag",
	author: "Author",
	series: "Series",
	collection: "Collection",
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

/** Values a facet always offers, whatever the library holds. Tags, authors,
 *  series and collections come from the library instead. */
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
	/** A serial's own id. */
	seriesId: string | null;
	/** Live collections the row is in; the series collections among them are its book series. */
	collectionIds: readonly string[];
	/** 0 when unknown. */
	wordCount: number;
	rating: number | null;
	/** 0..100 */
	progress: number;
	addedAt: number;
	lastRead: number | null;
};

export type FacetValues = Record<Facet, readonly string[]> & {
	/** null when the row has no known word count. */
	wordCount: number | null;
};

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
		series: fields.seriesId ? [fields.seriesId] : fields.collectionIds.filter(isSeriesCollectionId),
		collection: fields.collectionIds,
		// Ratings count half stars; a 3.5 rounds up into the 4-star value.
		rating: [fields.rating ? String(Math.ceil(fields.rating / HALF_STARS_PER_STAR)) : UNRATED],
		progress: [progressBucket(fields.progress)],
		added: windowsContaining(fields.addedAt, now),
		lastRead: fields.lastRead == null ? [NEVER_READ] : windowsContaining(fields.lastRead, now),
		wordCount: fields.wordCount > 0 ? fields.wordCount : null,
	};
}

function inRange(wordCount: number | null, range: WordRange): boolean {
	if (wordCount == null) return false;
	if (range.min != null && wordCount < range.min) return false;
	return range.max == null || wordCount <= range.max;
}

/** AND across facets, OR within one facet's included values (AND in "all" mode);
 *  an excluded value always removes. */
export function matchesFilter(values: FacetValues, filter: LibraryFilter): boolean {
	for (const facet of FACETS) {
		const selection = filter[facet];
		if (!selection) continue;
		const carried = values[facet];
		if (selection.out.some((v) => carried.includes(v))) return false;
		if (selection.in.length === 0) continue;
		const isCarried = (v: string) => carried.includes(v);
		const matched =
			selection.mode === "all" ? selection.in.every(isCarried) : selection.in.some(isCarried);
		if (!matched) return false;
	}
	return !filter.words || inRange(values.wordCount, filter.words);
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
		...(current.mode && { mode: current.mode }),
	};
	if (state === "in") next.in.push(value);
	if (state === "out") next.out.push(value);
	const { [facet]: _, ...rest } = filter;
	return next.in.length + next.out.length > 0 ? { ...rest, [facet]: next } : rest;
}

export const setValueState = withState;

const NEXT_STATE: Record<ValueState, ValueState> = { off: "in", in: "out", out: "off" };

/** Off, then include, then exclude, then off again. */
export function cycleValue(filter: LibraryFilter, facet: Facet, value: string): LibraryFilter {
	return withState(filter, facet, value, NEXT_STATE[valueState(filter, facet, value)]);
}

export function removeValue(filter: LibraryFilter, facet: Facet, value: string): LibraryFilter {
	return withState(filter, facet, value, "off");
}

/** Switches the tags facet between any and all; "any" drops the key, so a new filter starts on any. */
export function setTagsMode(filter: LibraryFilter, mode: "any" | "all"): LibraryFilter {
	const tags = filter.tags;
	if (!tags) return filter;
	const { mode: _, ...rest } = tags;
	return { ...filter, tags: mode === "all" ? { ...rest, mode } : rest };
}

export function setWordRange(filter: LibraryFilter, range: WordRange | null): LibraryFilter {
	const { words: _, ...rest } = filter;
	if (!range || (range.min == null && range.max == null)) return rest;
	const { min, max } = range;
	const ordered = min != null && max != null && min > max ? { min: max, max: min } : range;
	return { ...rest, words: ordered };
}

/** Compact word counts: 150000 → "150k", 1200000 → "1.2M". */
export function formatWords(n: number): string {
	if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
	if (n >= 1000) return `${Number((n / 1000).toFixed(1))}k`;
	return String(n);
}

export function wordRangeLabel({ min, max }: WordRange): string {
	if (min != null && max != null) return `${formatWords(min)}–${formatWords(max)}`;
	if (min != null) return `> ${formatWords(min)}`;
	return `< ${formatWords(max ?? 0)}`;
}

export const WORD_RANGE_PRESETS: readonly WordRange[] = [
	{ max: 50_000 },
	{ min: 50_000, max: 100_000 },
	{ min: 100_000, max: 150_000 },
	{ min: 150_000 },
	{ min: 300_000 },
];

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

/** Value chips plus the Length range, which has no chip of its own kind. */
export function activeFilterCount(filter: LibraryFilter): number {
	return chipsOf(filter).length + (filter.words ? 1 : 0);
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

function wordBound(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.round(value)
		: undefined;
}

function parseWordRange(value: unknown): WordRange | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { min: rawMin, max: rawMax } = value as { min?: unknown; max?: unknown };
	const min = wordBound(rawMin);
	const max = wordBound(rawMax);
	if (min != null && max != null && min > max) return undefined;
	if (min == null && max == null) return undefined;
	return { ...(min != null && { min }), ...(max != null && { max }) };
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
		const {
			in: included,
			out,
			mode,
		} = selection as { in?: unknown; out?: unknown; mode?: unknown };
		const next: FacetSelection = { in: stringList(included), out: stringList(out) };
		if (facet === "tags" && mode === "all") next.mode = "all";
		if (next.in.length + next.out.length > 0) filter[facet] = next;
	}
	const words = parseWordRange((facets as Record<string, unknown>).words);
	if (words) filter.words = words;
	return filter;
}

// A spread into String.fromCharCode overflows the call stack on a large filter.
const toBase64Url = (bytes: Uint8Array) =>
	btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

/** The filter as the library URL's `f` param; undefined for an empty filter. */
export function encodeFilterParam(filter: LibraryFilter): string | undefined {
	if (activeFilterCount(filter) === 0) return undefined;
	return toBase64Url(new TextEncoder().encode(serializeFilter(filter)));
}

/** Far above any filter a person builds; a longer param is a crafted link. */
export const FILTER_PARAM_MAX = 16_384;

/** null when the param is missing or cannot be decoded at all. */
export function decodeFilterParam(param: string | undefined): LibraryFilter | null {
	if (!param || param.length > FILTER_PARAM_MAX) return null;
	try {
		const base64 = param.replace(/-/g, "+").replace(/_/g, "/");
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		return parseFilter(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return null;
	}
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
