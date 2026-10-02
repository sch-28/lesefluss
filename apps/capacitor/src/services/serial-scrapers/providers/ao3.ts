import { fetchHtml } from "../fetch";
import type {
	ChapterFetchResult,
	ChapterRef,
	SearchOptions,
	SearchResult,
	SerialScraper,
	SeriesDetails,
	SeriesMetadata,
} from "../types";
import { absolutize, extractParagraphs, parseHtml, stripHidden, textOrNull } from "../utils/html";
import { platformThrottleMs, throttle } from "../utils/throttle";

const PROVIDER_ID = "ao3" as const;
// AO3 is volunteer-run and rate-limits aggressively against single-IP bursts,
// so the catalog (shared-IP) gate stays at 5 s.
const THROTTLE_MS = platformThrottleMs(2_000, 5_000);

const HOST = "archiveofourown.org";
const ORIGIN = `https://${HOST}`;

/**
 * `canHandle` only matches `/works/` paths — AO3 also has `/series/` (a
 * collection of works), but treating those as importable serials needs its
 * own metadata + chapter aggregation. Out of scope for v1.
 */
const WORK_PATH_RE = /^\/works\/\d+/;

const PATHS = {
	work: (workId: string) => `${ORIGIN}/works/${workId}`,
	navigate: (workRootUrl: string) => `${workRootUrl}/navigate`,
	/**
	 * Sort by kudos descending — "most popular" within the matched query.
	 *
	 * Trade-off: AO3's native default is "best match" (relevance). For heavy
	 * fandoms, kudos-desc surfaces canonical-of-the-fandom works above
	 * niche-but-relevant matches. For typical user intent ("show me what
	 * people loved that matches my query") kudos-desc still wins on average,
	 * but a sort picker should default to relevance with kudos as one of
	 * three options when it ships.
	 *
	 * AO3's other useful sort columns: `revised_at` (date updated),
	 * `created_at` (date posted), `hits`, `comments_count`, `bookmarks_count`,
	 * `word_count`. `SearchOptions` has no sort field; add one there when a
	 * sort picker lands.
	 */
	search: (query: string, opts: SearchOptions = {}) =>
		`${ORIGIN}/works/search?work_search%5Bquery%5D=${encodeURIComponent(query)}` +
		"&work_search%5Bsort_column%5D=kudos_count" +
		"&work_search%5Bsort_direction%5D=desc" +
		(opts.status ? `&work_search%5Bcomplete%5D=${opts.status === "completed" ? "T" : "F"}` : "") +
		(opts.page && opts.page > 1 ? `&page=${opts.page}` : ""),
	/**
	 * AO3 doesn't expose a dedicated "popular" listing, but its work-search
	 * with an empty query and `sort_column=kudos_count` returns the highest-kudos
	 * works site-wide — effectively "most loved on AO3 right now". Same markup
	 * as `search`, so the same parser handles both.
	 */
	popular: () =>
		`${ORIGIN}/works/search?work_search%5Bquery%5D=` +
		"&work_search%5Bsort_column%5D=kudos_count" +
		"&work_search%5Bsort_direction%5D=desc",
} as const;

const SELECTORS = {
	// Work page (fetchSeriesMetadata)
	title: "#workskin .preface .title, h2.title.heading",
	author: "#workskin .preface .byline a[rel='author'], a[rel='author']",
	summary: "#workskin .preface .summary blockquote, .summary blockquote",

	// Navigate page (fetchChapterList)
	chapterListItem: "ol.chapter.index.group li a",

	// Chapter page (fetchChapterContent). First match wins.
	//
	// AO3 work pages render up to three `.userstuff` elements: the work
	// summary and notes (`<blockquote class="userstuff">`) plus the chapter
	// body (`<div class="userstuff module" role="article">`). A bare
	// `.userstuff` selector picks the summary (DOM order), so anchor on the
	// body's distinguishing markers — `role="article"` is canonical, with
	// `div.userstuff.module` as a structural fallback if AO3 ever drops the
	// role attribute but keeps the class scheme.
	chapterContent: ".userstuff[role='article'], div.userstuff.module",

	// Search results page (search)
	searchResult: "li.work.blurb.group",
	searchResultTitleAnchor: ".heading a:not([rel='author'])",
	searchResultAuthor: "a[rel='author']",
	searchResultSummary: "blockquote.userstuff.summary",
	/**
	 * Chapter count: AO3 renders `<dd class="chapters">5/?</dd>` (or `5/10`,
	 * `1/1`). We parse the published count (numerator).
	 */
	searchResultChapters: "dl.stats dd.chapters",
	searchResultFandoms: "h5.fandoms a.tag",
} as const;

/** Resolve a possibly-relative AO3 URL to an absolute one. */
function abs(href: string): string {
	return absolutize(href, ORIGIN);
}

/**
 * Resolve any AO3 URL (work, chapter, series) to its `/works/{id}` root.
 *   /works/12345                       → /works/12345
 *   /works/12345/chapters/67890        → /works/12345
 *   /works/12345?view_full_work=true   → /works/12345
 */
function workRootFromUrl(url: string): string {
	const m = new URL(url).pathname.match(/\/works\/(\d+)/);
	if (!m) throw new Error("AO3_URL_NOT_A_WORK");
	return PATHS.work(m[1]);
}

/**
 * Parse AO3's chapter-stats text. Common formats:
 *   "5/10"  → published=5, expected=10  → 5
 *   "5/?"   → published=5, expected unknown → 5
 *   "1/1"   → 1
 * Returns null if parsing fails.
 */
function parseChapterCount(el: Element | null): number | null {
	const text = textOrNull(el);
	if (!text) return null;
	const m = text.match(/^(\d+)/);
	return m ? Number(m[1]) : null;
}

export const ao3Scraper: SerialScraper = {
	id: PROVIDER_ID,
	isIncludedInAllPopular: false,
	timeoutMs: 30_000,

	canHandle(url: string): boolean {
		try {
			const u = new URL(url);
			const hostMatches = u.hostname === HOST || u.hostname.endsWith(`.${HOST}`);
			return hostMatches && WORK_PATH_RE.test(u.pathname);
		} catch {
			return false;
		}
	},

	async fetchSeriesMetadata(url: string): Promise<SeriesMetadata> {
		const sourceUrl = workRootFromUrl(url);
		const tocUrl = PATHS.navigate(sourceUrl);

		await throttle(PROVIDER_ID, THROTTLE_MS);
		let doc = parseHtml(await fetchHtml(sourceUrl));
		let title = textOrNull(doc.querySelector(SELECTORS.title));

		// Multi-chapter works 302 the work root to the first chapter URL, and
		// some HTTP clients (CapacitorHttp on Android in particular) don't
		// surface the redirect body cleanly — we end up with no #workskin and
		// no title. `?view_full_work=true` forces AO3 to render the work
		// inline, no redirect. Same trick bypasses the archive-warning gate
		// when combined with `view_adult=true`. Heavier on bandwidth (a long
		// work renders all chapters inline), so only used as a fallback.
		if (!title) {
			await throttle(PROVIDER_ID, THROTTLE_MS);
			doc = parseHtml(await fetchHtml(`${sourceUrl}?view_full_work=true&view_adult=true`));
			title = textOrNull(doc.querySelector(SELECTORS.title));
		}

		if (!title) throw new Error(`AO3_TITLE_NOT_FOUND:${sourceUrl}`);

		return {
			title,
			author: textOrNull(doc.querySelector(SELECTORS.author)),
			// AO3 works don't ship cover images; other providers (ScribbleHub,
			// Royal Road) return one — extract it in their fetchSeriesMetadata.
			coverImage: null,
			description: textOrNull(doc.querySelector(SELECTORS.summary)),
			sourceUrl,
			tocUrl,
			provider: PROVIDER_ID,
			details: parseWorkDetails(doc),
		};
	},

	async fetchChapterList(tocUrl: string): Promise<ChapterRef[]> {
		await throttle(PROVIDER_ID, THROTTLE_MS);
		const doc = parseHtml(await fetchHtml(tocUrl));

		const items = doc.querySelectorAll(SELECTORS.chapterListItem);
		if (items.length === 0) {
			// Single-chapter works render an empty /navigate page; the work page
			// itself is the only "chapter".
			const workUrl = tocUrl.replace(/\/navigate$/, "");
			return [{ index: 0, title: "Chapter 1", sourceUrl: workUrl }];
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

	capabilities: { searchPaging: true, statusFilter: true },

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		// Empty-query guarding is the public surface's job (registry.searchAll +
		// useSearchSerials' `enabled` flag). Keep this method a pure extractor.
		await throttle(PROVIDER_ID, THROTTLE_MS);
		return parseWorksList(parseHtml(await fetchHtml(PATHS.search(query, opts))));
	},

	async getPopular(): Promise<SearchResult[]> {
		await throttle(PROVIDER_ID, THROTTLE_MS);
		return parseWorksList(parseHtml(await fetchHtml(PATHS.popular())));
	},

	async fetchChapterContent(ref: ChapterRef): Promise<ChapterFetchResult> {
		try {
			await throttle(PROVIDER_ID, THROTTLE_MS);
			const doc = parseHtml(await fetchHtml(ref.sourceUrl));

			const root = doc.querySelector(SELECTORS.chapterContent);
			if (!root) return { status: "error", reason: `AO3_CONTENT_NOT_FOUND:${ref.sourceUrl}` };

			// AO3 doesn't hide nodes inside .userstuff today; this is defensive
			// parity with the Royal Road adapter, which does.
			stripHidden(root);
			const content = extractParagraphs(root);
			if (!content.trim()) return { status: "error", reason: `AO3_EMPTY_CONTENT:${ref.sourceUrl}` };
			return { status: "fetched", content };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { status: "error", reason: `${msg} (${ref.sourceUrl})` };
		}
	},
};

/**
 * Parse an AO3 works-listing page (search results, kudos-sorted popular, …).
 * Same `li.work.blurb.group` markup across all listings.
 */
function parseWorksList(doc: Document): SearchResult[] {
	const results: SearchResult[] = [];
	for (const li of doc.querySelectorAll(SELECTORS.searchResult)) {
		const titleAnchor = li.querySelector(SELECTORS.searchResultTitleAnchor);
		const href = titleAnchor?.getAttribute("href");
		const title = textOrNull(titleAnchor);
		if (!href || !title) continue;
		// Works have no covers; the fandom is what lets a card stand in for one.
		const fandoms = [...li.querySelectorAll(SELECTORS.searchResultFandoms)]
			.map((a) => a.textContent?.trim() ?? "")
			.filter(Boolean);
		results.push({
			title,
			author: textOrNull(li.querySelector(SELECTORS.searchResultAuthor)),
			description: textOrNull(li.querySelector(SELECTORS.searchResultSummary)),
			coverImage: null,
			chapterCount: parseChapterCount(li.querySelector(SELECTORS.searchResultChapters)),
			sourceUrl: abs(href),
			provider: PROVIDER_ID,
			...(fandoms.length > 0
				? { details: { ao3: { rating: [], warnings: [], fandoms, relationships: [] } } }
				: {}),
		});
	}
	return results;
}

function tagTexts(doc: Document, kind: string): string[] {
	return [...doc.querySelectorAll(`dl.work.meta dd.${kind}.tags a.tag`)]
		.map((a) => a.textContent?.trim() ?? "")
		.filter(Boolean);
}

function statNumber(doc: Document, kind: string): number | undefined {
	const text = doc.querySelector(`dl.stats dd.${kind}`)?.textContent ?? "";
	const n = Number(text.replace(/[^\d]/g, ""));
	return text && Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Work metadata from the `dl.work.meta` block. A work is complete when its
 * chapter count reads "n/n"; "n/?" or "n/m" with m > n is still in progress.
 */
export function parseWorkDetails(doc: Document): SeriesDetails {
	if (!doc.querySelector("dl.work.meta")) return {};
	const details: SeriesDetails = {
		ao3: {
			rating: tagTexts(doc, "rating"),
			warnings: tagTexts(doc, "warning"),
			fandoms: tagTexts(doc, "fandom"),
			relationships: tagTexts(doc, "relationship"),
		},
	};
	const tags = tagTexts(doc, "freeform");
	if (tags.length > 0) details.tags = tags;

	const chapters = doc.querySelector("dl.stats dd.chapters")?.textContent?.trim().split("/");
	if (chapters?.length === 2) {
		const [written, planned] = chapters;
		details.status = written === planned ? "completed" : "ongoing";
	}
	const updated =
		doc.querySelector("dl.stats dd.status")?.textContent?.trim() ??
		doc.querySelector("dl.stats dd.published")?.textContent?.trim();
	if (updated && /^\d{4}-\d{2}-\d{2}$/.test(updated)) details.lastUpdated = updated;

	const words = statNumber(doc, "words");
	if (words) details.wordCount = words;
	const kudos = statNumber(doc, "kudos");
	if (kudos) details.kudos = kudos;
	return details;
}
