import type { ViewMode } from "../../components/view-mode-toggle";
import type { CatalogSort, CatalogSource } from "../../services/catalog/client";
import type { CatalogSearchFilters } from "../../services/catalog/query-keys";
import { LENGTH_BUCKETS, type LengthBucket, wordBounds } from "./length";

/**
 * Everything that defines what Explore shows, as it lives in the URL. The URL
 * is the source of truth so back navigation, reload and shared links all
 * restore the same view.
 */
export type ExploreSearch = {
	q?: string;
	genre?: string;
	/** An author's name as the catalog shows it; matched by author key server-side. */
	author?: string;
	/** Comma-separated tag ids. */
	tags?: string;
	lang?: string;
	sort?: CatalogSort;
	source?: CatalogSource;
	/** Reading-time bucket, turned into word bounds at the reader's WPM. */
	length?: LengthBucket;
	view?: ViewMode;
	/** "catalog" asks for the full public-domain results instead of the grouped search. */
	scope?: "catalog";
};

const SORTS: readonly CatalogSort[] = [
	"relevance",
	"popular",
	"title",
	"author",
	"recent",
	"length",
];
const SOURCES: readonly CatalogSource[] = ["standard_ebooks", "gutenberg"];

const MAX_AUTHOR_LENGTH = 200;

/** The catalog's per-request tag limit; more would be a 400. */
export const MAX_CATALOG_TAGS = 5;
const TAG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANG = /^(all|[a-z]{2,3})$/;

function str(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function oneOf<T extends string>(v: unknown, options: readonly T[]): T | undefined {
	return options.find((option) => option === v);
}

/** Route `validateSearch`: drops anything malformed rather than failing navigation. */
export function parseExploreSearch(raw: Record<string, unknown>): ExploreSearch {
	const tags = parseTags(str(raw.tags));
	const lang = str(raw.lang)?.toLowerCase();
	return {
		q: str(raw.q),
		genre: str(raw.genre),
		author: str(raw.author)?.slice(0, MAX_AUTHOR_LENGTH),
		tags: tags.length > 0 ? tags.join(",") : undefined,
		lang: lang && LANG.test(lang) ? lang : undefined,
		sort: oneOf(raw.sort, SORTS),
		source: oneOf(raw.source, SOURCES),
		length: oneOf(raw.length, LENGTH_BUCKETS),
		view: oneOf(raw.view, ["grid", "list"] as const),
		scope: oneOf(raw.scope, ["catalog"] as const),
	};
}

export function parseTags(tags: string | undefined): string[] {
	if (!tags) return [];
	return [
		...new Set(
			tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => TAG_ID.test(t)),
		),
	].slice(0, MAX_CATALOG_TAGS);
}

/** Next search state with `patch` applied; `undefined` removes a key. */
export function withSearch(current: ExploreSearch, patch: Partial<ExploreSearch>): ExploreSearch {
	const next: ExploreSearch = { ...current, ...patch };
	for (const [key, value] of Object.entries(next)) {
		if (value === undefined) Reflect.deleteProperty(next, key);
	}
	return next;
}

export function canAddTag(current: ExploreSearch): boolean {
	return parseTags(current.tags).length < MAX_CATALOG_TAGS;
}

export function addTag(current: ExploreSearch, tagId: string): ExploreSearch {
	const tags = parseTags(current.tags);
	if (tags.includes(tagId) || tags.length >= MAX_CATALOG_TAGS) return current;
	return withSearch(current, { tags: [...tags, tagId].join(",") });
}

export function removeTag(current: ExploreSearch, tagId: string): ExploreSearch {
	const tags = parseTags(current.tags).filter((t) => t !== tagId);
	return withSearch(current, { tags: tags.length > 0 ? tags.join(",") : undefined });
}

/** Readable fallback for a tag whose label hasn't loaded: "ghost-stories" → "Ghost stories". */
export function tagLabelFromId(id: string): string {
	const words = id.replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Filters only the catalog understands; web-novel providers cannot apply them. */
export function hasCatalogFilters(s: ExploreSearch): boolean {
	return Boolean(s.genre || s.author || s.tags || s.source || s.length);
}

export type ExploreMode = "landing" | "grouped" | "catalog";

export function exploreMode(s: ExploreSearch): ExploreMode {
	if (!s.q && !hasCatalogFilters(s) && s.scope !== "catalog") return "landing";
	if (s.q && !hasCatalogFilters(s) && s.scope !== "catalog") return "grouped";
	return "catalog";
}

/** The catalog request for the current search, with length turned into word bounds at `wpm`. */
export function toCatalogFilters(
	s: ExploreSearch,
	lang: string,
	wpm: number,
): CatalogSearchFilters {
	return {
		q: s.q ?? "",
		lang,
		genre: s.genre,
		author: s.author,
		tags: parseTags(s.tags),
		source: s.source,
		sort: effectiveSort(s),
		...(s.length ? wordBounds(s.length, wpm) : {}),
	};
}

/** What the server would pick when no sort is given, shown as the selected option. */
export function effectiveSort(s: ExploreSearch): CatalogSort {
	return s.sort ?? (s.q ? "relevance" : "popular");
}
