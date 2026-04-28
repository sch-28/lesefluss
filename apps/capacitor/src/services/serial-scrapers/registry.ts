import { log } from "../../utils/log";
import { ao3Scraper } from "./providers/ao3";
import { royalroadScraper } from "./providers/royalroad";
import { scribblehubScraper } from "./providers/scribblehub";
import { wuxiaworldScraper } from "./providers/wuxiaworld";
import type { ProviderId, SearchResult, SerialScraper } from "./types";

/**
 * First `canHandle()` match wins. Pasting a chapter URL imports the whole
 * series — adapters extract the series root inside `fetchSeriesMetadata`.
 */
const SCRAPERS: SerialScraper[] = [ao3Scraper, scribblehubScraper, royalroadScraper, wuxiaworldScraper];

export const scrapersById: Record<ProviderId, SerialScraper | undefined> = Object.fromEntries(
	SCRAPERS.map((s) => [s.id, s]),
) as Record<ProviderId, SerialScraper | undefined>;

export function detectScraper(url: string): SerialScraper | null {
	return SCRAPERS.find((s) => s.canHandle(url)) ?? null;
}

export function isSerialUrl(url: string): boolean {
	return SCRAPERS.some((s) => s.canHandle(url));
}

/** Result of a fan-out search across every provider that exposes `search`. */
export type SearchAllResult = {
	results: SearchResult[];
	/**
	 * Providers whose `search()` rejected. The UI surfaces this as a discreet
	 * "X unavailable" hint; merged `results` still contains everyone else's
	 * hits so one bad provider never blacks out the search box.
	 */
	failedProviders: ProviderId[];
};

/**
 * Per-provider search timeout. Generous enough for slow connections and
 * rate-limited APIs; short enough that a single hung provider doesn't hold
 * the fan-out result hostage. Timed-out providers land in `failedProviders`
 * and the UI surfaces them as "unavailable" while still showing all other hits.
 */
const PROVIDER_SEARCH_TIMEOUT_MS = 8_000;

/**
 * Races `promise` against a `ms`-millisecond deadline. Clears the timer
 * when the original promise settles first so no dangling timers remain.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let handle: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_, reject) => {
		handle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
	});
	return Promise.race([promise, deadline]).finally(() => clearTimeout(handle));
}

/**
 * Run free-text search across every provider that exposes one (skips
 * scrapers without a `search` method, e.g. `'rss'`). Each provider's
 * results stream back independently; one failure doesn't drop the rest.
 *
 * Per-provider rate limiting is enforced by `utils/throttle` inside each
 * adapter — concurrent calls here pace correctly.
 *
 * `opts.provider` filters `SCRAPERS` to a single provider before fan-out;
 * useful when the UI offers a provider chip filter and we want to save
 * throttle bandwidth on unselected providers. Unknown ids resolve to an
 * empty SCRAPER list and yield `{ results: [], failedProviders: [] }`.
 *
 * Each provider is individually capped at `PROVIDER_SEARCH_TIMEOUT_MS` so a
 * single hung provider cannot stall the entire fan-out.
 */
export async function searchAll(
	query: string,
	opts: { provider?: ProviderId } = {},
): Promise<SearchAllResult> {
	const trimmed = query.trim();
	if (!trimmed) return { results: [], failedProviders: [] };

	const pool = opts.provider ? SCRAPERS.filter((s) => s.id === opts.provider) : SCRAPERS;

	// flatMap-then-allSettled pairs the provider id with each promise so we can
	// report which providers failed without an extra index→id lookup.
	const tasks = pool.flatMap((s) =>
		s.search ? [{ id: s.id, promise: s.search(trimmed) }] : [],
	);
	const settled = await Promise.allSettled(
		tasks.map((t) => withTimeout(t.promise, PROVIDER_SEARCH_TIMEOUT_MS, t.id)),
	);

	const results: SearchResult[] = [];
	const failedProviders: ProviderId[] = [];
	settled.forEach((r, i) => {
		const providerId = tasks[i].id;
		if (r.status === "fulfilled") {
			results.push(...r.value);
		} else {
			failedProviders.push(providerId);
			log.warn("serial-scrapers", `search failed for ${providerId}:`, r.reason);
		}
	});

	// "All" view: bias merged results toward richer items (cover image, then
	// bucketed chapter count) so the user's first impression isn't dominated
	// by AO3 (no covers) or thin SH stubs. Stable sort preserves each
	// provider's internal ranking within ties. Skipped when a single provider
	// is selected — that scraper's own relevance order should win.
	if (!opts.provider) {
		results.sort((a, b) => qualityScore(b) - qualityScore(a));
	}
	return { results, failedProviders };
}

function qualityScore(r: SearchResult): number {
	const cover = r.coverImage ? 100 : 0;
	const ch = r.chapterCount ?? 0;
	// Bucket so a 2000-chapter outlier doesn't crush a clearly relevant 80-ch
	// match: >=50 → 30, >=10 → 20, >0 → 10, 0 → 0.
	const chapters = ch >= 50 ? 30 : ch >= 10 ? 20 : ch > 0 ? 10 : 0;
	return cover + chapters;
}
