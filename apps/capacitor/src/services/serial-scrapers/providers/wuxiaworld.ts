import { fetchHtml } from "../fetch";
import type {
	ChapterFetchResult,
	ChapterRef,
	SearchResult,
	SerialScraper,
	SeriesMetadata,
} from "../types";
import {
	extractParagraphs,
	extractScriptAssignment,
	parseHtml,
	stripHidden,
	stripTags,
} from "../utils/html";
import { throttle } from "../utils/throttle";

const PROVIDER_ID = "wuxiaworld" as const;
/**
 * No published crawl-delay on WW. 2s matches the conservative "polite
 * scraping" pace we use for sites without explicit guidance.
 */
const THROTTLE_MS = 2_000;

const HOST = "www.wuxiaworld.com";
/** Bare domain — `canHandle` accepts both `www.` and the apex. */
const HOST_BARE = "wuxiaworld.com";
const ORIGIN = `https://${HOST}`;

/**
 * `canHandle` matches `/novel/{slug}` plus any deeper path within it (novel
 * root, the `/chapters` subpage, or chapter URLs). Excludes listing pages
 * like `/novels/`.
 */
const NOVEL_PATH_RE = /^\/novel\/[a-z0-9-]+/i;

const PATHS = {
	/**
	 * The `/chapters` subpage embeds the same series metadata as the novel
	 * root AND the full `chapterGroups` structure with `from`/`to` integer
	 * ranges. We use it for both `fetchSeriesMetadata` and `fetchChapterList`
	 * so a series import is two requests instead of one-per-chapter.
	 */
	novelChapters: (slug: string) => `${ORIGIN}/novel/${slug}/chapters`,
	chapter: (novelSlug: string, chapterSlug: string) =>
		`${ORIGIN}/novel/${novelSlug}/${chapterSlug}`,
	/**
	 * First-party JSON search endpoint. Returns `{ items: WwSearchItem[] }`.
	 * The v2 prefix was removed server-side; the live path is /api/novels/search.
	 */
	search: (query: string) => `${ORIGIN}/api/novels/search?query=${encodeURIComponent(query)}`,
} as const;

/**
 * WW is a Next.js + Tailwind SPA, so DOM selectors are minimal — almost
 * everything we need is in the embedded `__REACT_QUERY_STATE__` blob (see
 * `extractScriptAssignment`). The only DOM selector that survives across
 * page rewrites is the chapter-content container, kept as a fallback for
 * `fetchChapterContent` if the JSON path ever moves.
 */
const SELECTORS = {
	chapterContent: "div.chapter-content",
} as const;

/**
 * Shape of a single item in the `/api/novels/search` JSON response. Only
 * the fields we consume are typed; extras are ignored.
 */
type WwSearchItem = {
	name?: string;
	slug?: string;
	coverUrl?: string | null;
	synopsis?: string | null;
	chapterCount?: number | null;
};

/**
 * Subset of the React Query state we actually consume. Other queries and
 * fields exist; we narrow with `unknown` + runtime guards rather than typing
 * the whole tree.
 */
type WwNovelItem = {
	name?: string;
	slug?: string;
	authorName?: { value?: string | null } | null;
	synopsis?: { value?: string | null } | null;
	coverUrl?: { value?: string | null } | null;
	chapterInfo?: {
		chapterCount?: { value?: number | null } | null;
		firstChapter?: { slug?: string | null; number?: { units?: number | null } | null } | null;
		latestChapter?: { slug?: string | null; number?: { units?: number | null } | null } | null;
		chapterGroups?: WwChapterGroup[];
	} | null;
};

type WwChapterGroup = {
	title?: string | null;
	order?: number;
	fromChapterNumber?: { units?: number | null } | null;
	toChapterNumber?: { units?: number | null } | null;
};

type WwChapterItem = {
	name?: string;
	slug?: string;
	karmaInfo?: { isKarmaRequired?: boolean } | null;
	content?: { value?: string | null } | null;
};

type WwReactQueryState = {
	queries?: Array<{
		queryKey?: unknown;
		state?: { data?: { item?: unknown } | null } | null;
	}>;
};

/**
 * Find the React Query payload whose `queryKey[0]` matches `prefix` and
 * return its `state.data.item`, narrowed to the caller-provided shape. Used
 * by both metadata and chapter extraction — they consume different queries
 * from the same blob, but the find-then-pluck dance is identical.
 *
 * Returns `null` if the assignment is missing, the matching query isn't
 * present, or its data has no `item` field.
 */
function findQueryItem<T>(doc: Document, prefix: string): T | null {
	const state = extractScriptAssignment(doc, "__REACT_QUERY_STATE__") as
		| WwReactQueryState
		| null;
	const query = state?.queries?.find(
		(q) => Array.isArray(q.queryKey) && (q.queryKey as unknown[])[0] === prefix,
	);
	const item = query?.state?.data?.item;
	return (item as T) ?? null;
}

/**
 * Resolve any WW URL to the canonical novel-root slug.
 *   /novel/martial-world                         → "martial-world"
 *   /novel/martial-world/chapters                → "martial-world"
 *   /novel/martial-world/mw-chapter-1            → "martial-world"
 */
function novelSlugFromUrl(url: string): string {
	const m = new URL(url).pathname.match(/^\/novel\/([a-z0-9-]+)/i);
	if (!m) throw new Error("WUXIAWORLD_URL_NOT_A_NOVEL");
	return m[1];
}

/**
 * Derive the per-novel chapter-slug prefix from `firstChapter.slug` by
 * stripping the trailing `-N`. Example: `mw-chapter-0` → `mw-chapter-`.
 * Returns `null` if the slug doesn't end in a number, in which case
 * synthesis is impossible and `fetchChapterList` falls back to a single
 * placeholder ref pointing at the novel root.
 */
function deriveChapterSlugPrefix(firstChapterSlug: string | null | undefined): string | null {
	if (!firstChapterSlug) return null;
	const m = firstChapterSlug.match(/^(.*-)\d+$/);
	return m ? m[1] : null;
}

/**
 * Build the synthesized chapter list from the `chapterGroups` ranges,
 * clamped by the published `firstChapter` / `latestChapter` bounds.
 *
 * Some novels use a single sentinel group like `from: 0, to: 9999` that
 * covers the whole book, regardless of how many chapters actually exist.
 * Without clamping, the synthesizer would happily emit 10 000 ghost rows
 * for a 1 357-chapter novel. The bounds give us the real published span;
 * each group's range is intersected with that span so sentinel values get
 * trimmed back to reality.
 *
 * Numbering is integer `units` only — sub-numbered teaser chapters
 * (`number.nanos > 0`) aren't surfaced because we'd have no way to
 * construct their slug. Any synthesized chapter that 404s upstream becomes
 * an `error` row via `fetchChapterContent`'s normal failure path.
 */
function synthesizeChapterRefs(
	novelSlug: string,
	prefix: string,
	groups: WwChapterGroup[],
	bounds: { min: number; max: number },
): ChapterRef[] {
	const refs: ChapterRef[] = [];
	let index = 0;
	for (const g of groups) {
		const rawFrom = g.fromChapterNumber?.units ?? null;
		const rawTo = g.toChapterNumber?.units ?? null;
		if (rawFrom == null || rawTo == null || rawTo < rawFrom) continue;
		const from = Math.max(rawFrom, bounds.min);
		const to = Math.min(rawTo, bounds.max);
		if (to < from) continue;
		for (let n = from; n <= to; n++) {
			refs.push({
				index,
				title: `Chapter ${n}`,
				sourceUrl: `${ORIGIN}/novel/${novelSlug}/${prefix}${n}`,
			});
			index++;
		}
	}
	return refs;
}

export const wuxiaworldScraper: SerialScraper = {
	id: PROVIDER_ID,

	canHandle(url: string): boolean {
		try {
			const u = new URL(url);
			const hostMatches = u.hostname === HOST || u.hostname === HOST_BARE;
			return hostMatches && NOVEL_PATH_RE.test(u.pathname);
		} catch {
			return false;
		}
	},

	async fetchSeriesMetadata(url: string): Promise<SeriesMetadata> {
		const slug = novelSlugFromUrl(url);
		const sourceUrl = PATHS.novelChapters(slug);
		// WW renders the chapter list inline as part of the SSR React Query
		// state on the same page; tocUrl === sourceUrl mirrors ScribbleHub.
		const tocUrl = sourceUrl;

		await throttle(PROVIDER_ID, THROTTLE_MS);
		const item = findQueryItem<WwNovelItem>(
			parseHtml(await fetchHtml(sourceUrl)),
			"novel",
		);

		return {
			title: item?.name?.trim() || "Untitled",
			author: item?.authorName?.value?.trim() || null,
			coverImage: item?.coverUrl?.value ?? null,
			// `synopsis.value` is HTML in the JSON blob (`<p>…</p>`) — strip to
			// plain text so the preview UI doesn't render raw markup.
			description: stripTags(item?.synopsis?.value),
			sourceUrl,
			tocUrl,
			provider: PROVIDER_ID,
		};
	},

	async fetchChapterList(tocUrl: string): Promise<ChapterRef[]> {
		const slug = novelSlugFromUrl(tocUrl);

		// Same `/novel/{slug}/chapters` URL the metadata call hit a moment ago.
		// We re-fetch instead of caching across adapter methods because the
		// `SerialScraper` contract treats each method as independent — a cache
		// would have to live in the pipeline, not the adapter. The 2 s
		// per-provider throttle paces both calls; revisit if/when import
		// latency becomes a real problem.
		await throttle(PROVIDER_ID, THROTTLE_MS);
		const item = findQueryItem<WwNovelItem>(
			parseHtml(await fetchHtml(PATHS.novelChapters(slug))),
			"novel",
		);

		const groups = item?.chapterInfo?.chapterGroups ?? [];
		const prefix = deriveChapterSlugPrefix(item?.chapterInfo?.firstChapter?.slug);
		const minUnits = item?.chapterInfo?.firstChapter?.number?.units;
		const maxUnits = item?.chapterInfo?.latestChapter?.number?.units;

		// No groups OR no derivable slug pattern OR no published bounds:
		// synthesize a single placeholder ref pointing at the novel root so
		// the importer doesn't blow up on an empty list (mirrors ScribbleHub
		// + AO3). Bounds are required because some novels use sentinel group
		// ranges (`from: 0, to: 9999`) that would otherwise generate
		// thousands of ghost chapters — see `synthesizeChapterRefs`.
		if (
			groups.length === 0 ||
			!prefix ||
			typeof minUnits !== "number" ||
			typeof maxUnits !== "number"
		) {
			return [{ index: 0, title: "Chapter 1", sourceUrl: tocUrl }];
		}

		return synthesizeChapterRefs(slug, prefix, groups, { min: minUnits, max: maxUnits });
	},

	async fetchChapterContent(ref: ChapterRef): Promise<ChapterFetchResult> {
		try {
			await throttle(PROVIDER_ID, THROTTLE_MS);
			const doc = parseHtml(await fetchHtml(ref.sourceUrl));

			const item = findQueryItem<WwChapterItem>(doc, "chapter");

			// Karma-paywall check: WW serves a partial teaser even for paid
			// chapters, so trust the explicit flag rather than content length.
			if (item?.karmaInfo?.isKarmaRequired === true) {
				return { status: "locked" };
			}

			// Primary path: extract content HTML from the JSON blob and run it
			// through the same paragraph normalizer the other adapters use.
			// Fallback: read `div.chapter-content` directly if the JSON shape
			// drifts but the SSR DOM is still intact.
			const contentHtml = item?.content?.value ?? null;
			const root = contentHtml
				? parseHtml(contentHtml).body
				: doc.querySelector(SELECTORS.chapterContent);
			if (!root) return { status: "error", reason: "CONTENT_NOT_FOUND" };

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

		// WW exposes a JSON API — fetchHtml returns the raw JSON string. Any
		// JSON.parse failure propagates intentionally so searchAll catches it
		// and surfaces the provider in `failedProviders` (mirrors any other
		// network error in search).
		const raw = await fetchHtml(PATHS.search(query));
		const parsed = JSON.parse(raw) as { items?: WwSearchItem[] };
		const items = parsed?.items ?? [];

		const results: SearchResult[] = [];
		for (const item of items) {
			if (!item.name || !item.slug) continue;
			results.push({
				title: item.name,
				// WW search results don't include a separate author/translator
				// field; fetchSeriesMetadata returns the full author from the
				// novel page.
				author: null,
				// JSON `synopsis` embeds HTML (`<p>`, `<br>`, entities). Strip
				// to plain text so the preview UI doesn't render raw markup.
				description: stripTags(item.synopsis),
				coverImage: item.coverUrl ?? null,
				chapterCount: typeof item.chapterCount === "number" ? item.chapterCount : null,
				sourceUrl: `${ORIGIN}/novel/${item.slug}`,
				provider: PROVIDER_ID,
			});
		}
		return results;
	},
};
