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

const PROVIDER_ID = "royalroad" as const;
/**
 * RR has no published crawl-delay. 2s matches the conservative "polite
 * scraping" pace we use for other providers without an explicit rate limit.
 */
const THROTTLE_MS = 2_000;

const HOST = "www.royalroad.com";
/** Bare domain — `canHandle` accepts both `www.` and the apex. */
const HOST_BARE = "royalroad.com";
const ORIGIN = `https://${HOST}`;

/**
 * `canHandle` matches `/fiction/{id}` and any deeper path within it
 * (fiction root, chapter URLs). Excludes `/fictions/` (listing pages) which
 * start with `/fictions/`, not `/fiction/`.
 */
const FICTION_PATH_RE = /^\/fiction\/\d+/;

const PATHS = {
	/**
	 * Royal Road search by title.
	 *
	 * RR has no relevance or popularity sort exposed in the URL — results come
	 * back in their default order (rating + recency blend). A sort picker
	 * should surface this when the search UI matures.
	 */
	search: (query: string) =>
		`${ORIGIN}/fictions/search?title=${encodeURIComponent(query)}`,
} as const;

const SELECTORS = {
	// Fiction page (fetchSeriesMetadata)
	title: "div.fic-header h1",
	author: "div.fic-header h4 a[href^='/profile/']",
	cover: "div.cover-art-container img[data-type='cover']",
	/**
	 * Synopsis is wrapped in a `<div class="hidden-content">` with a checkbox
	 * toggle for the "read more" expander. Content is fully present in the SSR
	 * HTML regardless of the toggle state — textContent works fine.
	 */
	description: "div.fiction-info div.description div.hidden-content",

	// Chapter page (fetchChapterContent)
	chapterContent: "div.chapter-inner.chapter-content",

	/**
	 * Anti-piracy class discovery. Royal Road injects hidden anti-piracy spans
	 * whose hide-class name is randomised per request and defined in <head>
	 * as `display: none`. The inline `style` attribute on the *element* is not
	 * set — so the existing `stripHidden` (which only checks inline styles and
	 * aria-hidden) won't catch these. We read every <head><style> block to
	 * build a class blacklist before stripping.
	 *
	 * Adapter-private: only RR uses this pattern today. If FF.net or
	 * Wuxiaworld adopt the same mechanism, lift `collectHiddenClasses` and
	 * `stripHiddenClasses` into `utils/html.ts`.
	 */
	hiddenStyleBlocks: "head style",

	// Search results page (search)
	searchResult: "div.fiction-list-item",
	searchResultTitleAnchor: "h2.fiction-title a",
	searchResultCover: "figure img[data-type='cover']",
	/**
	 * Description div has inline `style="display: none"` (JS toggle), but the
	 * text is fully present in SSR HTML — textContent works fine.
	 */
	searchResultDescription: "div[id^='description-']",
	/**
	 * Chapter count: iterate `div.row.stats span` and pick the first whose
	 * text matches `/N Chapters?/`. Royal Road does NOT include author name in
	 * search results — author is always returned as null from `search`.
	 */
	searchResultStats: "div.row.stats span",
} as const;

/**
 * Resolve a possibly-relative Royal Road URL to an absolute one.
 * Thin wrapper over the shared helper that closes over RR's ORIGIN.
 */
function abs(href: string): string {
	return absolutize(href, ORIGIN);
}

/**
 * Resolve any Royal Road URL to its fiction-root canonical path.
 *   /fiction/21220/mother-of-learning                         → /fiction/21220/mother-of-learning
 *   /fiction/21220/mother-of-learning/chapter/301778/slug     → /fiction/21220/mother-of-learning
 *   /fiction/21220                                            → /fiction/21220  (RR server-redirects to slug form)
 */
function fictionRootFromUrl(url: string): string {
	const pathname = new URL(url).pathname;

	// Chapter URL: strip everything from /chapter/ onward.
	const chapterMatch = pathname.match(/^(\/fiction\/\d+\/[a-z0-9-]+)\/chapter\//i);
	if (chapterMatch) return `${ORIGIN}${chapterMatch[1]}`;

	// Fiction root (with optional slug) or bare /fiction/{id}.
	const fictionMatch = pathname.match(/^\/fiction\/\d+(\/[a-z0-9-]+)?/i);
	if (fictionMatch) return `${ORIGIN}${fictionMatch[0]}`;

	throw new Error("ROYALROAD_URL_NOT_A_FICTION");
}

/**
 * Parse chapter count from a search-result item. Iterates `div.row.stats span`
 * elements and returns the first whose text matches `/N Chapters?/i`.
 *
 * Returns null for abbreviated counts like "1.6k" — the UI should render
 * "unknown" rather than a misleading truncated number.
 */
function parseChapterCount(item: Element): number | null {
	for (const span of item.querySelectorAll(SELECTORS.searchResultStats)) {
		const t = span.textContent?.trim() ?? "";
		const m = t.match(/^([\d,]+)\s+Chapters?\b/i);
		if (m) return Number(m[1].replace(/,/g, ""));
	}
	return null;
}

/**
 * Collect CSS class names declared with `display: none` or
 * `visibility: hidden` inside `<head><style>` blocks.
 *
 * Royal Road randomises these class names per request; the generated rule is
 * minimal (one class, one declaration), so a single-rule regex is reliable in
 * practice. The live smoke catches any upstream change to the pattern.
 */
function collectHiddenClasses(doc: Document): Set<string> {
	const hidden = new Set<string>();
	for (const style of doc.querySelectorAll(SELECTORS.hiddenStyleBlocks)) {
		const text = style.textContent ?? "";
		const ruleRe =
			/\.([A-Za-z_][\w-]*)\s*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^}]*\}/gi;
		// Standard exec-loop — avoids assignment-in-expression linting noise.
		let m = ruleRe.exec(text);
		while (m !== null) {
			hidden.add(m[1]);
			m = ruleRe.exec(text);
		}
	}
	return hidden;
}

/**
 * Remove elements inside `root` whose class list overlaps `hiddenClasses`.
 * Snapshots the node list before removal to avoid live-NodeList mutation.
 */
function stripHiddenClasses(root: Element, hiddenClasses: Set<string>): void {
	if (hiddenClasses.size === 0) return;
	const all = Array.from(root.querySelectorAll("*"));
	for (const el of all) {
		const classes = el.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? [];
		if (classes.some((c) => hiddenClasses.has(c))) el.remove();
	}
}

export const royalroadScraper: SerialScraper = {
	id: PROVIDER_ID,

	canHandle(url: string): boolean {
		try {
			const u = new URL(url);
			const hostMatches = u.hostname === HOST || u.hostname === HOST_BARE;
			return hostMatches && FICTION_PATH_RE.test(u.pathname);
		} catch {
			return false;
		}
	},

	async fetchSeriesMetadata(url: string): Promise<SeriesMetadata> {
		const sourceUrl = fictionRootFromUrl(url);
		// RR renders the chapter list inline on the fiction page — no separate
		// /navigate endpoint. tocUrl === sourceUrl (mirrors ScribbleHub).
		const tocUrl = sourceUrl;

		await throttle(PROVIDER_ID, THROTTLE_MS);
		const doc = parseHtml(await fetchHtml(sourceUrl));

		const coverSrc = doc.querySelector(SELECTORS.cover)?.getAttribute("src") ?? null;
		return {
			title: textOrNull(doc.querySelector(SELECTORS.title)) ?? "Untitled",
			author: textOrNull(doc.querySelector(SELECTORS.author)),
			coverImage: coverSrc ? abs(coverSrc) : null,
			description: textOrNull(doc.querySelector(SELECTORS.description)),
			sourceUrl,
			tocUrl,
			provider: PROVIDER_ID,
		};
	},

	async fetchChapterList(tocUrl: string): Promise<ChapterRef[]> {
		await throttle(PROVIDER_ID, THROTTLE_MS);
		const html = await fetchHtml(tocUrl);

		/**
		 * Chapter list is embedded as inline JSON, not a DOM table:
		 *   window.chapters = [{id, title, url, ...}, ...];
		 *
		 * Non-greedy `[\s\S]*?` stops at the first `];` — RR sometimes follows
		 * the chapters array with a sibling `window.volumes = [...]`, so a
		 * greedy match would overshoot into the next array literal.
		 *
		 * Fragility: this regex is brittle against script minification that
		 * removes the semicolon or restructures the assignment. The live smoke
		 * (`royalroad.live.test.ts`) is the canary — if RR changes the export
		 * shape the smoke fails before users do.
		 */
		const m = html.match(/window\.chapters\s*=\s*(\[[\s\S]*?\]);/);
		if (!m) throw new Error("ROYALROAD_CHAPTERS_NOT_FOUND");

		const raw = JSON.parse(m[1]) as Array<{ title: string; url: string }>;
		if (raw.length === 0) {
			// Draft or brand-new fiction with no published chapters: synthesize one
			// ref pointing at the fiction root (mirrors AO3 + ScribbleHub behaviour).
			return [{ index: 0, title: "Chapter 1", sourceUrl: tocUrl }];
		}

		return raw.map((c, i) => ({
			index: i,
			title: c.title,
			sourceUrl: abs(c.url),
		}));
	},

	async fetchChapterContent(ref: ChapterRef): Promise<ChapterFetchResult> {
		try {
			await throttle(PROVIDER_ID, THROTTLE_MS);
			// Parse the full document so <head><style> blocks are accessible for
			// the hidden-class blacklist (RR anti-piracy mechanism).
			const doc = parseHtml(await fetchHtml(ref.sourceUrl));

			const root = doc.querySelector(SELECTORS.chapterContent);
			if (!root) return { status: "error", reason: "CONTENT_NOT_FOUND" };

			// Two-stage anti-piracy strip:
			// 1. Head-style blacklist — removes RR's random-class hidden spans.
			// 2. stripHidden — removes inline style="display:none" / aria-hidden
			//    nodes (defensive parity with AO3 + ScribbleHub adapters).
			const hiddenClasses = collectHiddenClasses(doc);
			stripHiddenClasses(root, hiddenClasses);
			stripHidden(root);

			const content = extractParagraphs(root);
			if (!content.trim()) return { status: "error", reason: "EMPTY_CONTENT" };
			return { status: "fetched", content };
		} catch (err) {
			return { status: "error", reason: err instanceof Error ? err.message : String(err) };
		}
	},

	async search(query: string): Promise<SearchResult[]> {
		// Empty-query guarding belongs to the public surface (registry.searchAll
		// + useSearchSerials' `enabled` flag); keep this a pure extractor.
		await throttle(PROVIDER_ID, THROTTLE_MS);
		const doc = parseHtml(await fetchHtml(PATHS.search(query)));

		const results: SearchResult[] = [];
		for (const item of doc.querySelectorAll(SELECTORS.searchResult)) {
			const titleAnchor = item.querySelector(SELECTORS.searchResultTitleAnchor);
			const href = titleAnchor?.getAttribute("href");
			const title = textOrNull(titleAnchor);
			if (!href || !title) continue;

			const coverSrc =
				item.querySelector(SELECTORS.searchResultCover)?.getAttribute("src") ?? null;

			results.push({
				title,
				// Royal Road search results omit author names by design.
				// fetchSeriesMetadata always returns the author from the fiction page.
				author: null,
				description: textOrNull(item.querySelector(SELECTORS.searchResultDescription)),
				coverImage: coverSrc ? abs(coverSrc) : null,
				chapterCount: parseChapterCount(item),
				sourceUrl: abs(href),
				provider: PROVIDER_ID,
			});
		}
		return results;
	},
};
