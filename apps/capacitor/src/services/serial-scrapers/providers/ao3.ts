import { fetchHtml } from "../fetch";
import type {
	ChapterFetchResult,
	ChapterRef,
	SearchResult,
	SerialScraper,
	SeriesMetadata,
} from "../types";
import { absolutize, extractParagraphs, parseHtml, stripHidden, textOrNull } from "../utils/html";
import { throttle } from "../utils/throttle";

const PROVIDER_ID = "ao3" as const;
const THROTTLE_MS = 5_000;

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
	 * `word_count`. The interface in `types.ts` doesn't carry sort opts yet —
	 * extend `search?(query, opts?)` when the sort UI lands.
	 */
	search: (query: string) =>
		`${ORIGIN}/works/search?work_search%5Bquery%5D=${encodeURIComponent(query)}` +
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
	chapterContent: "#chapters .userstuff, #workskin .userstuff, .userstuff",

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
		const doc = parseHtml(await fetchHtml(sourceUrl));

		return {
			title: textOrNull(doc.querySelector(SELECTORS.title)) ?? "Untitled",
			author: textOrNull(doc.querySelector(SELECTORS.author)),
			// AO3 works don't ship cover images; other providers (ScribbleHub,
			// Royal Road) return one — extract it in their fetchSeriesMetadata.
			coverImage: null,
			description: textOrNull(doc.querySelector(SELECTORS.summary)),
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

	async search(query: string): Promise<SearchResult[]> {
		// Empty-query guarding is the public surface's job (registry.searchAll +
		// useSearchSerials' `enabled` flag). Keep this method a pure extractor.
		await throttle(PROVIDER_ID, THROTTLE_MS);
		const doc = parseHtml(await fetchHtml(PATHS.search(query)));

		const results: SearchResult[] = [];
		for (const li of doc.querySelectorAll(SELECTORS.searchResult)) {
			const titleAnchor = li.querySelector(SELECTORS.searchResultTitleAnchor);
			const href = titleAnchor?.getAttribute("href");
			const title = textOrNull(titleAnchor);
			if (!href || !title) continue;
			results.push({
				title,
				author: textOrNull(li.querySelector(SELECTORS.searchResultAuthor)),
				description: textOrNull(li.querySelector(SELECTORS.searchResultSummary)),
				coverImage: null,
				chapterCount: parseChapterCount(li.querySelector(SELECTORS.searchResultChapters)),
				sourceUrl: abs(href),
				provider: PROVIDER_ID,
			});
		}
		return results;
	},

	async fetchChapterContent(ref: ChapterRef): Promise<ChapterFetchResult> {
		try {
			await throttle(PROVIDER_ID, THROTTLE_MS);
			const doc = parseHtml(await fetchHtml(ref.sourceUrl));

			const root = doc.querySelector(SELECTORS.chapterContent);
			if (!root) return { status: "error", reason: "CONTENT_NOT_FOUND" };

			// AO3 doesn't hide nodes inside .userstuff today; this is defensive
			// parity with the Royal Road adapter, which does.
			stripHidden(root);
			const content = extractParagraphs(root);
			if (!content.trim()) return { status: "error", reason: "EMPTY_CONTENT" };
			return { status: "fetched", content };
		} catch (err) {
			return { status: "error", reason: err instanceof Error ? err.message : String(err) };
		}
	},
};
