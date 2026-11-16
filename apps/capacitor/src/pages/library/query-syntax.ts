import {
	type Facet,
	formatWords,
	type LibraryFilter,
	setValueState,
	setWordRange,
	WORD_RANGE_PRESETS,
	type WordRange,
} from "./filter-model";
import type { FacetOptions } from "./filter-picker";

export const QUERY_FIELDS = ["tag", "status", "author", "series", "rating", "in", "words"] as const;
export type QueryField = (typeof QUERY_FIELDS)[number];

const FIELD_FACET: Record<Exclude<QueryField, "words">, Facet> = {
	tag: "tags",
	status: "status",
	author: "author",
	series: "series",
	rating: "rating",
	in: "collection",
};

const isField = (s: string): s is QueryField => (QUERY_FIELDS as readonly string[]).includes(s);

export type QueryToken =
	| { kind: "facet"; facet: Facet; values: string[]; exclude: boolean }
	| { kind: "words"; range: WordRange };

/** Case- and accent-insensitive, so `in:cafe` finds "Café". */
export function fold(s: string): string {
	return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

type Part = { text: string; start: number; end: number; closed: boolean };

/** Splits on whitespace outside double quotes; `closed` is false for an open quote. */
function splitParts(input: string): Part[] {
	const parts: Part[] = [];
	let i = 0;
	while (i < input.length) {
		if (/\s/.test(input[i])) {
			i++;
			continue;
		}
		const start = i;
		let quoted = false;
		while (i < input.length && (quoted || !/\s/.test(input[i]))) {
			if (input[i] === '"') quoted = !quoted;
			i++;
		}
		parts.push({ text: input.slice(start, i), start, end: i, closed: !quoted });
	}
	return parts;
}

const TOKEN = /^(-?)([a-z]+):(.*)$/is;

function unquote(value: string): string {
	return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
		? value.slice(1, -1)
		: value;
}

function parseCount(raw: string): number | null {
	const m = /^(\d+(?:\.\d+)?)([km])?$/i.exec(raw.trim());
	if (!m) return null;
	const scale = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
	return Math.round(Number(m[1]) * scale);
}

/** `<50k`, `>=150k`, `=80k` or `50k-150k`; `<` and `<=` are the same bound, as in the Length picker. */
export function parseWordRange(raw: string): WordRange | null {
	const range = /^(.+)-(.+)$/.exec(raw);
	if (range) {
		const min = parseCount(range[1]);
		const max = parseCount(range[2]);
		return min != null && max != null ? { min: Math.min(min, max), max: Math.max(min, max) } : null;
	}
	const m = /^(>=|<=|>|<|=)(.+)$/.exec(raw);
	if (!m) return null;
	const n = parseCount(m[2]);
	if (n == null) return null;
	if (m[1].startsWith("<")) return { max: n };
	if (m[1].startsWith(">")) return { min: n };
	return { min: n, max: n };
}

const RATINGS = ["1", "2", "3", "4", "5"];

function parseRating(raw: string): string[] | null {
	const value = fold(raw);
	if (value === "none" || value === "unrated") return ["none"];
	const m = /^(>=|<=|>|<|=)?([1-5])$/.exec(value);
	if (!m) return null;
	const n = Number(m[2]);
	const keep: Record<string, (r: number) => boolean> = {
		">=": (r) => r >= n,
		"<=": (r) => r <= n,
		">": (r) => r > n,
		"<": (r) => r < n,
		"=": (r) => r === n,
	};
	const test = keep[m[1] ?? "="];
	const values = RATINGS.filter((r) => test(Number(r)));
	return values.length > 0 ? values : null;
}

function matchOptions(options: FacetOptions, facet: Facet, raw: string): string[] {
	const needle = fold(raw);
	if (!needle) return [];
	return options[facet]
		.filter((o) => fold(o.value) === needle || fold(o.label) === needle)
		.map((o) => o.value);
}

/** A whole `field:value` token, or null when it is plain text (unknown field or value). */
export function parseToken(text: string, options: FacetOptions): QueryToken | null {
	const m = TOKEN.exec(text);
	if (!m) return null;
	const exclude = m[1] === "-";
	const field = m[2].toLowerCase();
	const value = unquote(m[3]);
	if (!isField(field) || !value) return null;
	if (field === "words") {
		const range = exclude ? null : parseWordRange(value);
		return range ? { kind: "words", range } : null;
	}
	const facet = FIELD_FACET[field];
	const values = field === "rating" ? parseRating(value) : matchOptions(options, facet, value);
	return values && values.length > 0 ? { kind: "facet", facet, values, exclude } : null;
}

export function applyToken(filter: LibraryFilter, token: QueryToken): LibraryFilter {
	if (token.kind === "words") return setWordRange(filter, token.range);
	return token.values.reduce(
		(f, value) => setValueState(f, token.facet, value, token.exclude ? "out" : "in"),
		filter,
	);
}

/**
 * Turns every finished token into chips and leaves the rest as typed. A token is
 * finished when whitespace follows it, or when `all` (Enter) is set.
 */
export function commitQuery(
	input: string,
	filter: LibraryFilter,
	options: FacetOptions,
	all = false,
): { input: string; filter: LibraryFilter } | null {
	const parts = splitParts(input);
	const endsOpen = !/\s$/.test(input);
	let next = filter;
	let rest = "";
	let last = 0;
	let changed = false;
	parts.forEach((part, i) => {
		const finished = part.closed && (all || !endsOpen || i < parts.length - 1);
		const token = finished ? parseToken(part.text, options) : null;
		if (!token) return;
		next = applyToken(next, token);
		rest += input.slice(last, part.start);
		last = part.end;
		changed = true;
	});
	if (!changed) return null;
	rest += input.slice(last);
	return { input: rest.replace(/\s{2,}/g, " ").replace(/^\s+/, ""), filter: next };
}

/** The text that searches title and author: a known field still being typed is left out. */
export function searchTextOf(input: string): string {
	const parts = splitParts(input);
	const lastPart = parts.at(-1);
	if (!lastPart || /\s$/.test(input)) return input;
	const m = TOKEN.exec(lastPart.text);
	if (m && isField(m[2].toLowerCase())) return input.slice(0, lastPart.start);
	return input;
}

export type Suggestion = { label: string; detail?: string; insert: string };

function quoteIfNeeded(value: string): string {
	return /[\s"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

function wordPresetToken({ min, max }: WordRange): string {
	if (min != null && max != null) return `${formatWords(min)}-${formatWords(max)}`;
	if (min != null) return `>=${formatWords(min)}`;
	return `<=${formatWords(max ?? 0)}`;
}

const FIELD_HINTS: Record<QueryField, string> = {
	tag: "Tag",
	status: "Status",
	author: "Author",
	series: "Series",
	rating: "Rating, e.g. >=4",
	in: "Collection",
	words: "Length, e.g. <50k",
};

const MAX_SUGGESTIONS = 8;

/** Suggestions for the token being typed at the end of the input. */
export function suggestionsFor(input: string, options: FacetOptions): Suggestion[] {
	if (/\s$/.test(input)) return [];
	const lastPart = splitParts(input).at(-1);
	if (!lastPart) return [];
	const m = TOKEN.exec(lastPart.text);
	if (!m) {
		const bare = /^(-?)([a-z]+)$/i.exec(lastPart.text);
		if (!bare) return [];
		const prefix = bare[2].toLowerCase();
		return QUERY_FIELDS.filter((f) => f.startsWith(prefix) && f !== prefix)
			.filter((f) => !(bare[1] && f === "words"))
			.map((f) => ({
				label: `${bare[1]}${f}:`,
				detail: FIELD_HINTS[f],
				insert: `${bare[1]}${f}:`,
			}));
	}
	const neg = m[1];
	const field = m[2].toLowerCase();
	if (!isField(field)) return [];
	const typed = fold(m[3].replace(/"/g, ""));
	let candidates: { label: string; value: string; detail?: string }[];
	if (field === "words") {
		if (neg) return [];
		candidates = WORD_RANGE_PRESETS.map((r) => {
			const value = wordPresetToken(r);
			return { label: value, value, detail: "words" };
		});
	} else if (field === "rating") {
		candidates = [
			...["5", ">=4", ">=3", "<=2"].map((v) => ({ label: v, value: v, detail: "stars" })),
			{ label: "none", value: "none", detail: "Unrated" },
		];
	} else {
		const facet = FIELD_FACET[field];
		candidates = options[facet].map((o) => ({
			label: o.label,
			value: field === "status" ? o.value : o.label,
			detail: String(o.count),
		}));
	}
	return candidates
		.filter((c) => !typed || fold(c.label).includes(typed) || fold(c.value).includes(typed))
		.slice(0, MAX_SUGGESTIONS)
		.map((c) => ({
			label: c.label,
			detail: c.detail,
			insert: `${neg}${field}:${quoteIfNeeded(c.value)}`,
		}));
}

/** Replaces the token at the end of the input with a picked suggestion. */
export function pickSuggestion(input: string, suggestion: Suggestion): string {
	const lastPart = splitParts(input).at(-1);
	const head = lastPart ? input.slice(0, lastPart.start) : input;
	return `${head}${suggestion.insert}`;
}
