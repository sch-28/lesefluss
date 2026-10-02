import { useQuery } from "@tanstack/react-query";
import { serialPreviewKeys } from "../../services/db/hooks/query-keys";
import { previewSerial } from "../../services/serial-scrapers";
import { previewCache } from "./preview-cache";

const PREVIEW_STALE_TIME_MS = 10 * 60 * 1000;

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
	// The series page has no chapter count, so keep the one the listing had.
	const fetched = query.isPlaceholderData ? undefined : query.data;
	const result = fetched
		? { ...cached, ...fetched, chapterCount: fetched.chapterCount ?? cached?.chapterCount ?? null }
		: cached;
	return { ...query, result };
}
