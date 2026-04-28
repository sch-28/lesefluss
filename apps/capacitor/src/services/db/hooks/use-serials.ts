import { useQuery } from "@tanstack/react-query";
import { useDebounced } from "../../../utils/use-debounced";
import { type ProviderId, type SearchAllResult, searchSerials } from "../../serial-scrapers";
import { serialKeys } from "./query-keys";

const DEFAULT_DEBOUNCE_MS = 400;
const SEARCH_STALE_TIME_MS = 5 * 60 * 1000;

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

export const serialHooks = {
	useSearchSerials,
};
