import { useQuery } from "@tanstack/react-query";
import { serialPreviewKeys } from "../../services/db/hooks/query-keys";
import { previewSerial, type SearchResult } from "../../services/serial-scrapers";
import { previewCache } from "./preview-cache";

const PREVIEW_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * The fetched series page wins, except where it says less than the listing did:
 * the series page has no chapter count, and its word count may be missing (a
 * markup change), in which case the listing's estimate is still better than nothing.
 */
export function mergePreview(
	cached: SearchResult | undefined,
	fetched: SearchResult,
): SearchResult {
	const hasWords = !!fetched.details?.wordCount;
	return {
		...cached,
		...fetched,
		chapterCount: fetched.chapterCount ?? cached?.chapterCount ?? null,
		details:
			hasWords || !cached?.details?.wordCount
				? fetched.details
				: {
						...fetched.details,
						wordCount: cached.details.wordCount,
						wordCountEstimated: cached.details.wordCountEstimated,
					},
	};
}

/**
 * The preview's series metadata. A tap from search hands the listing entry
 * over through `previewCache`, so the page renders at once; the series page is
 * still fetched for what listings leave out (tags, status, stats). A cold
 * link (reload, share, killed app) only has the fetch.
 */
export function useSerialPreview(url: string | undefined) {
	const cached = previewCache.get(url);
	const query = useQuery({
		queryKey: serialPreviewKeys.byUrl(url ?? ""),
		queryFn: () => previewSerial(url ?? ""),
		enabled: !!url,
		placeholderData: cached,
		staleTime: PREVIEW_STALE_TIME_MS,
		// Providers are rate-limited; let the user decide when to retry.
		retry: false,
	});
	const fetched = query.isPlaceholderData ? undefined : query.data;
	const result = fetched ? mergePreview(cached, fetched) : cached;
	return { ...query, result };
}
