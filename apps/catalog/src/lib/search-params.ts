import { authorKeys, splitAuthors } from "./authors.js";
import { findGenre, type Genre } from "./genres.js";
import { parseLang } from "./language.js";
import { TAG_ID_PATTERN } from "./tags.js";

const SORTS = ["relevance", "popular", "title", "author", "recent", "length"] as const;
export type Sort = (typeof SORTS)[number];

export type SourceFilter = "standard_ebooks" | "gutenberg" | "any";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_TAGS = 5;
const MAX_AUTHOR_LENGTH = 200;
const MAX_Q_LENGTH = 200;
const MAX_AUTHOR_KEYS = 5;
// Title and author sorts have no index, so deep pages are full sorts. Nobody pages this far.
const MAX_OFFSET = 10_000;

export type SearchParams = {
	q: string;
	lang: string;
	genre: Genre | undefined;
	sort: Sort;
	source: SourceFilter;
	author: string | null;
	authorKeys: string[];
	tags: string[];
	minWords: number | null;
	maxWords: number | null;
	withTagFacets: boolean;
	page: number;
	limit: number;
};

type ParseResult = { ok: true; params: SearchParams } | { ok: false; error: string };

type Query = (name: string) => string | undefined;
type Queries = (name: string) => string[] | undefined;

export function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return fallback;
	const floored = Math.floor(n);
	return max ? Math.min(max, floored) : floored;
}

/** null when absent, undefined when malformed. */
function parseWordBound(raw: string | undefined): number | null | undefined {
	if (raw === undefined || raw === "") return null;
	if (!/^\d{1,9}$/.test(raw)) return undefined;
	return Number(raw);
}

function isSort(v: string): v is Sort {
	return (SORTS as readonly string[]).includes(v);
}

function parseSource(raw: string | undefined): SourceFilter | null {
	if (raw === undefined || raw === "" || raw === "any" || raw === "all") return "any";
	if (raw === "se" || raw === "standard_ebooks") return "standard_ebooks";
	if (raw === "gutenberg") return "gutenberg";
	return null;
}

/** Validation only; tag existence needs the DB and is checked by the route. */
export function parseSearchParams(query: Query, queries: Queries): ParseResult {
	const q = query("q")?.trim() ?? "";
	if (q.length > MAX_Q_LENGTH) return { ok: false, error: "q too long" };

	const genreId = query("genre")?.trim();
	const genre = genreId ? findGenre(genreId) : undefined;
	// An unknown genre is ignored, not rejected, so a stale shared link still loads;
	// the response echoes what was applied.

	const lang = parseLang(query("lang"));
	if (!lang) return { ok: false, error: "invalid lang" };

	const source = parseSource(query("source")?.trim());
	if (!source) return { ok: false, error: "invalid source" };

	const author = query("author")?.trim() || null;
	if (author && author.length > MAX_AUTHOR_LENGTH) return { ok: false, error: "author too long" };
	const keys = author ? authorKeys(splitAuthors(author)) : [];
	if (author && keys.length === 0) return { ok: false, error: "invalid author" };
	if (keys.length > MAX_AUTHOR_KEYS) return { ok: false, error: "too many authors" };

	const tags = [
		...new Set(
			(queries("tag") ?? [])
				.flatMap((t) => t.split(","))
				.map((t) => t.trim())
				.filter(Boolean),
		),
	];
	const badTag = tags.find((t) => !TAG_ID_PATTERN.test(t));
	if (badTag) return { ok: false, error: "invalid tag" };
	if (tags.length > MAX_TAGS) return { ok: false, error: `at most ${MAX_TAGS} tags` };

	const minWords = parseWordBound(query("min_words"));
	const maxWords = parseWordBound(query("max_words"));
	if (minWords === undefined || maxWords === undefined)
		return { ok: false, error: "invalid word count" };
	if (minWords !== null && maxWords !== null && minWords > maxWords) {
		return { ok: false, error: "invalid word count" };
	}

	// `order` is the pre-`sort` name; shipped app versions still send it.
	const rawSort = query("sort")?.trim() || query("order")?.trim();
	let sort: Sort;
	if (rawSort === undefined) sort = q ? "relevance" : "popular";
	else if (isSort(rawSort)) sort = rawSort;
	else return { ok: false, error: "invalid sort" };

	const page = parsePositiveInt(query("page"), 1);
	const limit = parsePositiveInt(query("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	if ((page - 1) * limit > MAX_OFFSET) return { ok: false, error: "page out of range" };

	const facets =
		query("facets")
			?.split(",")
			.map((f) => f.trim()) ?? [];

	return {
		ok: true,
		params: {
			q,
			lang,
			genre,
			sort,
			source,
			author,
			authorKeys: keys,
			tags,
			minWords,
			maxWords,
			withTagFacets: facets.includes("tags"),
			page,
			limit,
		},
	};
}
