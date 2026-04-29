import { fetchHtml } from "../fetch";
import type {
	ChapterFetchResult,
	ChapterRef,
	SearchResult,
	SerialScraper,
	SeriesMetadata,
} from "../types";
import { absolutize, extractParagraphs, parseHtml, stripHidden, textOrNull } from "../utils/html";
import { platformThrottleMs, throttle } from "../utils/throttle";

const PROVIDER_ID = "scribblehub" as const;
const THROTTLE_MS = platformThrottleMs(1_000, 2_000);

const HOST = "www.scribblehub.com";
/** Bare domain — `canHandle` accepts both `www.` and the apex. */
const HOST_BARE = "scribblehub.com";
const ORIGIN = `https://${HOST}`;

/**
 * `canHandle` accepts both series-root URLs and chapter URLs.
 *   /series/{id}/{slug}/                   — series root
 *   /read/{id}-{slug}/chapter/{n}/         — chapter (id and slug joined by '-')
 * Anything else (profiles, genres, bare host) is rejected.
 */
const SERIES_PATH_RE = /^\/series\/\d+\/[a-z0-9-]+/i;
const CHAPTER_PATH_RE = /^\/read\/\d+-[a-z0-9-]+\/chapter\/\d+/i;

const PATHS = {
	series: (id: string, slug: string) => `${ORIGIN}/series/${id}/${slug}/`,
	/**
	 * SH search uses WordPress's native query params; `post_type=fictionposts`
	 * scopes the results to series (vs forum posts, profiles, etc.). No sort
	 * controls are exposed in the URL — SH renders default-relevance.
	 */
	search: (query: string) => `${ORIGIN}/?s=${encodeURIComponent(query)}&post_type=fictionposts`,
	/**
	 * SH's series-ranking page sorted by favorites (sort=2 in SH's numeric URL
	 * scheme). Renders the same `div.search_main_box` cards the search page
	 * uses, so one parser handles both.
	 */
	popular: () => `${ORIGIN}/series-ranking/?sort=2&order=`,
} as const;

const SELECTORS = {
	// Series page (fetchSeriesMetadata + fetchChapterList — TOC is inline)
	title: "div.fic_title",
	author: "span.auth_name_fic",
	cover: "div.fic_image img",
	description: "div.wi_fic_desc",
	chapterListItem: "ol.toc_ol li a.toc_a",

	// Chapter page (fetchChapterContent)
	// SH applies both id="chp_raw" and class="chp_raw" to the same element;
	// #chp_raw always wins the OR, so the class fallback was dead. Simplify.
	chapterContent: "div#chp_raw",

	// Search results (search)
	searchResult: "div.search_main_box",
	searchResultTitleAnchor: "div.search_title a",
	searchResultAuthor: "span.a_un_st a",
	searchResultCover: "div.search_img img",
	/**
	 * Chapter count sits inside one of several `span.nl_stat destp` siblings
	 * with no per-stat class to disambiguate. We grab them all and pick the
	 * one whose text matches `/N Chapters?/`. SH renders abbreviated counts
	 * like "1.6k" — those return `null` (see `parseChapterCount`).
	 */
	searchResultStats: "span.nl_stat.destp",
	/**
	 * Description nodes to strip when cleaning `div.search_body`:
	 * everything that ISN'T the description prose. Joined into one selector
	 * for a single querySelectorAll pass.
	 */
	searchResultBodyChrome:
		"div.search_title, div.search_stats, div.search_genre, span.dots, span.morelink, span.testhide",
	searchResultBody: "div.search_body",
} as const;

/** Resolve a possibly-relative SH URL to an absolute one. */
function abs(href: string): string {
	return absolutize(href, ORIGIN);
}

/**
 * Resolve any SH URL (series root, chapter) to its `/series/{id}/{slug}/` root.
 *   /series/958046/test-novel/                           → /series/958046/test-novel/
 *   /read/958046-test-novel/chapter/3/                   → /series/958046/test-novel/
 *
 * SH chapter URLs encode `{id}-{slug}` as a single hyphenated path segment;
 * we split on the FIRST `-` to recover the numeric id and reconstruct the
 * series root without an extra fetch.
 */
function seriesRootFromUrl(url: string): string {
	const path = new URL(url).pathname;

	const seriesMatch = path.match(/^\/series\/(\d+)\/([a-z0-9-]+)/i);
	if (seriesMatch) return PATHS.series(seriesMatch[1], seriesMatch[2]);

	const chapterMatch = path.match(/^\/read\/(\d+)-([a-z0-9-]+)\/chapter\/\d+/i);
	if (chapterMatch) return PATHS.series(chapterMatch[1], chapterMatch[2]);

	throw new Error("SCRIBBLEHUB_URL_NOT_A_SERIES");
}

/**
 * SH renders search-result chapter counts as e.g. "7 Chapters" or "1.6k
 * Chapters". We only commit to a number when the prefix is a clean integer;
 * abbreviated counts return null so the UI can render "unknown" rather than
 * a misleading "1" (parsed from "1.6k").
 */
function parseChapterCount(stats: Iterable<Element>): number | null {
	for (const span of stats) {
		const t = span.textContent?.trim() ?? "";
		const m = t.match(/^(\d+)\s+Chapters?\b/i);
		if (m) return Number(m[1]);
	}
	return null;
}

/**
 * Extract the search-result description prose. SH places it as raw text +
 * `<br>` between `<div class="search_genre">` and the `... more>>` expander,
 * with the hidden expanded tail in `<span class="testhide">`. We clone the
 * body, drop the structural chrome, and read what's left.
 *
 * `cloneNode(true)` keeps us from mutating the live DOM (subsequent extractors
 * still need the original markup).
 */
function extractSearchDescription(body: Element): string | null {
	const clone = body.cloneNode(true) as Element;
	for (const node of clone.querySelectorAll(SELECTORS.searchResultBodyChrome)) {
		node.remove();
	}
	const text = clone.textContent?.replace(/\s+/g, " ").trim();
	return text && text.length > 0 ? text : null;
}

/**
 * SH cover placeholder when an author hasn't uploaded an image. We return
 * `null` so the UI can render its own fallback consistently.
 *
 * Assumption: SH's no-cover placeholder URL contains the substring
 * "noimagefound" (currently `mid_noimagefound.jpg`). If SH ever renames it,
 * this silently starts returning the broken URL instead of null. The correct
 * long-term fix is an Image `onError` fallback in the UI — revisit when the
 * cover-fallback design lands.
 */
function coverOrNull(src: string | null | undefined): string | null {
	if (!src) return null;
	if (src.includes("noimagefound")) return null;
	return src;
}

export const scribblehubScraper: SerialScraper = {
	id: PROVIDER_ID,

	canHandle(url: string): boolean {
		try {
			const u = new URL(url);
			const hostMatches = u.hostname === HOST || u.hostname === HOST_BARE;
			if (!hostMatches) return false;
			return SERIES_PATH_RE.test(u.pathname) || CHAPTER_PATH_RE.test(u.pathname);
		} catch {
			return false;
		}
	},

	async fetchSeriesMetadata(url: string): Promise<SeriesMetadata> {
		const sourceUrl = seriesRootFromUrl(url);
		// SH renders the chapter list inline on the series page — there's no
		// separate /navigate endpoint, so tocUrl === sourceUrl.
		const tocUrl = sourceUrl;

		await throttle(PROVIDER_ID, THROTTLE_MS);
		const doc = parseHtml(await fetchHtml(sourceUrl));

		const coverEl = doc.querySelector(SELECTORS.cover);
		return {
			title: textOrNull(doc.querySelector(SELECTORS.title)) ?? "Untitled",
			author: textOrNull(doc.querySelector(SELECTORS.author)),
			coverImage: coverOrNull(coverEl?.getAttribute("src")),
			description: textOrNull(doc.querySelector(SELECTORS.description)),
			sourceUrl,
			tocUrl,
			provider: PROVIDER_ID,
		};
	},

	async fetchChapterList(tocUrl: string): Promise<ChapterRef[]> {
		await throttle(PROVIDER_ID, THROTTLE_MS);
		const doc = parseHtml(await fetchHtml(tocUrl));

		const items = doc.querySelectorAll(SELECTORS.chapterListItem);
		if (items.length === 0) {
			// Drafts / brand-new series with no published chapters: synthesize
			// one ref pointing at the series root so the importer doesn't
			// blow up on an empty list (mirrors AO3's navigate-empty path).
			return [{ index: 0, title: "Chapter 1", sourceUrl: tocUrl }];
		}

		const refs: ChapterRef[] = [];
		items.forEach((a, i) => {
			const href = a.getAttribute("href");
			if (!href) return;
			refs.push({
				index: i,
				title: a.textContent?.trim() || `Chapter ${i + 1}`,
				sourceUrl: abs(href),
			});
		});
		return refs;
	},

	async search(query: string): Promise<SearchResult[]> {
		// Empty-query guarding belongs to the public surface (registry.searchAll
		// + useSearchSerials' `enabled` flag); keep this method a pure extractor.
		await throttle(PROVIDER_ID, THROTTLE_MS);
		return parseSeriesList(parseHtml(await fetchHtml(PATHS.search(query))));
	},

	async getPopular(): Promise<SearchResult[]> {
		await throttle(PROVIDER_ID, THROTTLE_MS);
		return parseSeriesList(parseHtml(await fetchHtml(PATHS.popular())));
	},

	async fetchChapterContent(ref: ChapterRef): Promise<ChapterFetchResult> {
		try {
			await throttle(PROVIDER_ID, THROTTLE_MS);
			const doc = parseHtml(await fetchHtml(ref.sourceUrl));

			const root = doc.querySelector(SELECTORS.chapterContent);
			if (!root) return { status: "error", reason: "CONTENT_NOT_FOUND" };

			// SH doesn't ship hidden anti-piracy paragraphs today; this is
			// defensive parity with the Royal Road adapter and cheap.
			stripHidden(root);
			const content = extractParagraphs(root);
			if (!content.trim()) return { status: "error", reason: "EMPTY_CONTENT" };
			return { status: "fetched", content };
		} catch (err) {
			return { status: "error", reason: err instanceof Error ? err.message : String(err) };
		}
	},
};

/**
 * Parse a ScribbleHub listing page (search results, series-ranking, …). SH's
 * `div.search_main_box` cards render with the same selectors across listings,
 * so one extractor serves every entry point.
 */
function parseSeriesList(doc: Document): SearchResult[] {
	const results: SearchResult[] = [];
	for (const box of doc.querySelectorAll(SELECTORS.searchResult)) {
		const titleAnchor = box.querySelector(SELECTORS.searchResultTitleAnchor);
		const href = titleAnchor?.getAttribute("href");
		const title = textOrNull(titleAnchor);
		if (!href || !title) continue;

		const body = box.querySelector(SELECTORS.searchResultBody);
		results.push({
			title,
			author: textOrNull(box.querySelector(SELECTORS.searchResultAuthor)),
			description: body ? extractSearchDescription(body) : null,
			coverImage: coverOrNull(box.querySelector(SELECTORS.searchResultCover)?.getAttribute("src")),
			chapterCount: parseChapterCount(box.querySelectorAll(SELECTORS.searchResultStats)),
			sourceUrl: abs(href),
			provider: PROVIDER_ID,
		});
	}
	return results;
}
