import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { bookKeys, serialKeys } from "../../services/db/hooks/query-keys";
import { fetchAndStoreChapter } from "../../services/serial-scrapers";
import { log } from "../../utils/log";

export type BatchProgress = { current: number; total: number };

export type ChapterBatchDownload = {
	isRunning: boolean;
	progress: BatchProgress | null;
	start: (chapterIds: string[]) => Promise<void>;
	cancel: () => void;
};

/**
 * Total attempts per chapter (1 initial + 1 retry). Transient upstream blips
 * (5xx, dropped TCP, parse hiccups) are common enough across hundreds of
 * sequential fetches that auto-retrying once cuts visible failures sharply.
 * `locked` results are not retried, since the paywall outcome is intentional.
 */
const MAX_ATTEMPTS = 2;

/**
 * Backoff between the initial attempt and the retry. Short by design: the
 * per-provider throttle gate already paces the next call, so we just want
 * a small breather to let a transient upstream issue clear.
 */
const RETRY_BACKOFF_MS = 2_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Try a chapter fetch up to `MAX_ATTEMPTS` times. Returns once the chapter
 * resolves to `fetched` or `locked`; throws (or logs and gives up) only after
 * the last attempt also fails. The per-provider throttle gate inside
 * `fetchAndStoreChapter` enforces inter-call pacing, so the only extra wait
 * here is the small backoff between an `error` outcome and the retry.
 */
async function fetchChapterWithRetry(id: string): Promise<void> {
	let lastErr: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const result = await fetchAndStoreChapter(id);
			if (result.status !== "error") return;
			lastErr = new Error(`chapter returned status=error (attempt ${attempt})`);
		} catch (err) {
			lastErr = err;
		}
		if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BACKOFF_MS);
	}
	throw lastErr;
}

/**
 * Drives a "Download all pending chapters" loop for a single series. Fetches
 * sequentially; pacing is left to the per-provider throttle gate in
 * `services/serial-scrapers/utils/throttle.ts` so we don't compound it with
 * another sleep here. Each chapter is auto-retried once on transient failure.
 * Cancellable via a ref flag so the in-flight chapter still completes (or
 * fails fast) before the loop bails out. Unmounting the consumer cancels the
 * loop too: leaving the SeriesDetail page shouldn't keep a ghost batch
 * running invisibly. Errors that survive the retry are logged and skipped so
 * one bad chapter doesn't kill the whole batch.
 */
export function useChapterBatchDownload(seriesId: string | undefined): ChapterBatchDownload {
	const qc = useQueryClient();
	const [progress, setProgress] = useState<BatchProgress | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	// Refs (not state) for the running + cancel flags: state updates are batched
	// across renders, so a state-based re-entry guard would let two rapid `start()`
	// calls both pass before React commits. Refs are synchronous.
	const runningRef = useRef(false);
	const cancelRef = useRef(false);

	const start = useCallback(
		async (chapterIds: string[]) => {
			if (chapterIds.length === 0 || runningRef.current) return;
			runningRef.current = true;
			cancelRef.current = false;
			setIsRunning(true);
			setProgress({ current: 0, total: chapterIds.length });
			try {
				for (let i = 0; i < chapterIds.length; i++) {
					if (cancelRef.current) break;
					const id = chapterIds[i];
					try {
						await fetchChapterWithRetry(id);
					} catch (err) {
						log.warn("batch-download", `chapter ${id} failed after retry:`, err);
					}
					qc.invalidateQueries({ queryKey: bookKeys.detail(id) });
					qc.invalidateQueries({ queryKey: bookKeys.content(id) });
					if (seriesId) {
						qc.invalidateQueries({ queryKey: serialKeys.chapters(seriesId) });
					}
					setProgress({ current: i + 1, total: chapterIds.length });
				}
			} finally {
				runningRef.current = false;
				setIsRunning(false);
				setProgress(null);
			}
		},
		[qc, seriesId],
	);

	const cancel = useCallback(() => {
		cancelRef.current = true;
	}, []);

	useEffect(
		() => () => {
			cancelRef.current = true;
		},
		[],
	);

	return { isRunning, progress, start, cancel };
}
