import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useDebounced } from "../../../utils/use-debounced";
import {
	normalizeSeriesUrl,
	type PopularWindow,
	type ProviderId,
	popularSerials,
	type SearchAllResult,
	type SeriesStatus,
	searchSerials,
} from "../../serial-scrapers";
import { serialKeys } from "./query-keys";

const DEFAULT_DEBOUNCE_MS = 400;
const SEARCH_STALE_TIME_MS = 5 * 60 * 1000;
const POPULAR_STALE_TIME_MS = 30 * 60 * 1000;

/**
 * Free-text search across every serial provider that supports search. Returns
 * `{ results, failedProviders }` — the UI groups results by provider and can
 * surface a discreet "X unavailable" hint without dropping siblings.
 *
 * Behavior:
 *   - Internally debounces the query (default 400ms) — typing freely into the
 *     search box doesn't fan out one upstream call per keystroke. Provider is
 *     NOT debounced: chip taps should refetch immediately so the filter feels
 *     responsive.
 *   - Disabled when the trimmed query is empty.
 *   - 5-minute cache per exact query — re-typing the same string in a session
 *     won't re-hit upstream.
 *   - `retry: false` — searches hit rate-limited APIs; failing fast is better
 *     than stacking 3 retries behind the same throttle gate.
 */
function useSearchSerials(
	query: string,
	opts: { debounceMs?: number; provider?: ProviderId } = {},
) {
	const debounced = useDebounced(query.trim(), opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
	const provider = opts.provider;
	return useQuery<SearchAllResult>({
		queryKey: serialKeys.search(debounced, provider),
		queryFn: () => searchSerials(debounced, { provider }),
		enabled: debounced.length > 0,
		staleTime: SEARCH_STALE_TIME_MS,
		retry: false,
	});
}

/**
 * Popular/trending shelf for the web-novels page's empty state. Fans out
 * across every provider that exposes `getPopular`; merges into a quality-sorted
 * "All" view when no provider chip is selected, otherwise leaves that
 * provider's own ordering alone.
 *
 * Cached 30 minutes — popular content moves slowly, no need to re-hit upstream
 * every navigation.
 */
function usePopularSerials(provider?: ProviderId, window?: PopularWindow) {
	return useQuery<SearchAllResult>({
		queryKey: serialKeys.popular(provider, window),
		queryFn: () => popularSerials({ provider, window }),
		staleTime: POPULAR_STALE_TIME_MS,
		retry: false,
	});
}

/** Providers list this many results per search page; fewer means the last page. */
const PROVIDER_PAGE_SIZE = 20;

/**
 * Next page to ask for, or undefined at the end: a short page, a page that adds
 * no series not already listed, or a failed page (the caller offers a retry).
 */
export function nextSerialPage(
	last: SearchAllResult,
	pages: SearchAllResult[],
): number | undefined {
	if (last.failedProviders.length > 0) return undefined;
	if (last.results.length < PROVIDER_PAGE_SIZE) return undefined;
	const earlier = new Set(
		pages.slice(0, -1).flatMap((p) => p.results.map((r) => normalizeSeriesUrl(r.sourceUrl))),
	);
	const addsNew = last.results.some((r) => !earlier.has(normalizeSeriesUrl(r.sourceUrl)));
	return addsNew ? pages.length + 1 : undefined;
}

/**
 * Search one provider page by page, for providers that page their results.
 * Same debounce and caching as `useSearchSerials`; see `nextSerialPage`.
 */
function useSearchSerialPages(
	query: string,
	opts: { provider: ProviderId; status?: SeriesStatus; enabled: boolean; debounceMs?: number },
) {
	const debounced = useDebounced(query.trim(), opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
	const { provider, status } = opts;
	return useInfiniteQuery({
		queryKey: serialKeys.searchPages(debounced, provider, status),
		queryFn: ({ pageParam }) => searchSerials(debounced, { provider, status, page: pageParam }),
		initialPageParam: 1,
		getNextPageParam: nextSerialPage,
		enabled: opts.enabled && debounced.length > 0,
		staleTime: SEARCH_STALE_TIME_MS,
		retry: false,
	});
}

export const serialHooks = {
	useSearchSerials,
	usePopularSerials,
	useSearchSerialPages,
};
