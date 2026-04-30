import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../../../components/toast";
import { pollChapterList, removeSerial } from "../../serial-scrapers";
import { queries } from "../queries";
import type { SeriesActivity } from "../queries/series";
import type { Book, Series } from "../schema";
import { bookKeys, serialKeys } from "./query-keys";

/**
 * All series visible in the library (excludes tombstones). Series carry their
 * own `coverImage` column, so we don't need a parallel covers map like books do.
 */
function useSeriesList() {
	return useQuery<Series[]>({
		queryKey: serialKeys.list,
		queryFn: () => queries.getSeriesList(),
	});
}

/** Single series row by id. Used when the reader needs provider metadata for a chapter. */
function useSeries(seriesId: string | undefined | null) {
	return useQuery<Series | undefined>({
		queryKey: serialKeys.detail(seriesId ?? ""),
		// `enabled` gates the call when seriesId is nullish, so the empty-string
		// fallback below is never executed in practice.
		queryFn: () => queries.getSeries(seriesId ?? ""),
		enabled: !!seriesId,
	});
}

/**
 * One COUNT(*)-grouped query that returns chapter counts for every series.
 * Replaces a per-card hook that issued N round trips on library mount.
 *
 * The library page calls this once and passes each card its own count via
 * props — DRY both at the SQL level and at the React level.
 */
function useSeriesChapterCounts() {
	return useQuery<Map<string, number>>({
		queryKey: serialKeys.counts,
		queryFn: () => queries.getSeriesChapterCounts(),
	});
}

/**
 * Per-series aggregates (chapter totals, started/finished counts, latest read
 * timestamp) used by the library's filter+sort to apply book-style
 * unread/reading/done semantics and "recent" ordering at the series level.
 */
function useSeriesActivity() {
	return useQuery<Map<string, SeriesActivity>>({
		queryKey: serialKeys.activity,
		queryFn: () => queries.getSeriesActivity(),
	});
}

/**
 * Soft-delete a series (and tombstone every chapter row). Cleans the cache for
 * both books (chapter rows are books) and the series subtree, then schedules sync.
 */
function useDeleteSeries() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (s: Pick<Series, "id" | "title">) => removeSerial(s.id),
		onSuccess: (_data, s) => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: serialKeys.all });
			toast.success(`Removed "${s.title}"`);
		},
		onError: () => toast.error("Failed to remove series"),
	});
}

/**
 * Ordered chapter rows (books) for a single series. Keyed under
 * `serialKeys.chapters(seriesId)` so that lazy chapter-fetch mutations can
 * invalidate just this query after updating `chapterStatus`.
 */
function useSeriesChapters(seriesId: string | undefined) {
	return useQuery<Book[]>({
		queryKey: serialKeys.chapters(seriesId ?? ""),
		queryFn: () => queries.getSeriesChapters(seriesId ?? ""),
		enabled: !!seriesId,
	});
}

/**
 * Fire-on-mount hook that polls the upstream TOC for new chapters and inserts
 * them as `pending` rows. The chapter list query (`useSeriesChapters`) is
 * invalidated on success so new rows appear automatically.
 *
 * Polling runs once per mount — the throttle inside each scraper's
 * `fetchChapterList` gates rapid repeated calls at the network level.
 * Errors don't block reading. The caller decides whether to surface `error`.
 * `retry()` re-runs the poll.
 */
function useChapterListSync(seriesId: string | undefined): {
	isSyncing: boolean;
	error: Error | null;
	retry: () => void;
} {
	const qc = useQueryClient();
	const [isSyncing, setIsSyncing] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [attempt, setAttempt] = useState(0);
	// Prevent re-polling when seriesId changes from undefined to a value while
	// this component is already mounted (e.g. series data arrives after the hook
	// initialises). React Strict Mode's double-effect runs on the same fiber so
	// the ref value is already true on the second pass — no double-poll.
	const hasFired = useRef(false);

	useEffect(() => {
		if (!seriesId || hasFired.current) return;
		hasFired.current = true;
		let mounted = true;

		setIsSyncing(true);
		setError(null);
		pollChapterList(seriesId)
			.then(({ added }) => {
				if (!mounted) return;
				if (added > 0) {
					qc.invalidateQueries({ queryKey: serialKeys.chapters(seriesId) });
					qc.invalidateQueries({ queryKey: serialKeys.counts });
				}
			})
			.catch((err) => {
				if (!mounted) return;
				setError(err instanceof Error ? err : new Error(String(err)));
			})
			.finally(() => {
				if (mounted) setIsSyncing(false);
			});

		return () => {
			mounted = false;
		};
	}, [seriesId, qc, attempt]);

	const retry = useCallback(() => {
		hasFired.current = false;
		setAttempt((n) => n + 1);
	}, []);

	return { isSyncing, error, retry };
}

export const seriesHooks = {
	useSeriesList,
	useSeries,
	useSeriesChapterCounts,
	useSeriesActivity,
	useDeleteSeries,
	useSeriesChapters,
	useChapterListSync,
};
