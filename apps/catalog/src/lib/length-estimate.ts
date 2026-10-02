/**
 * Bytes of PG's `.txt.utf-8` edition per word as lib/word-count.ts counts the
 * EPUB, calibrated on a stratified sample (`__tests__/calibrate.ts`, and
 * agents/catalog.md "Length estimate"). English apart: other languages run
 * longer words or more multi-byte letters, and one shared factor overstated
 * German and Finnish by up to a third.
 */
export const BYTES_PER_WORD = { en: 5.9, other: 7 } as const;

export function estimateWords(
	textBytes: number | null | undefined,
	language: string | null | undefined,
): number | null {
	if (!textBytes) return null;
	const factor = language === "en" ? BYTES_PER_WORD.en : BYTES_PER_WORD.other;
	return Math.max(1, Math.round(textBytes / factor));
}

/** Below this relative change a new estimate is noise, not news. */
const ESTIMATE_CHANGE_THRESHOLD = 0.01;

/**
 * The estimate to store: the stored one unless the new one differs by more
 * than 1%. PG rebuilds its text files now and then, shifting sizes by a few
 * bytes; without this every such rebuild would rewrite the row.
 */
export function settledEstimate(stored: number | null, fresh: number | null): number | null {
	if (stored === null || fresh === null) return fresh;
	return Math.abs(fresh - stored) / stored > ESTIMATE_CHANGE_THRESHOLD ? fresh : stored;
}

/** What clients show: the exact count wins over the estimate. */
export function effectiveLength(
	exact: number | null,
	estimate: number | null,
): { wordCount: number | null; wordCountEstimated: boolean } {
	if (exact !== null) return { wordCount: exact, wordCountEstimated: false };
	return { wordCount: estimate, wordCountEstimated: estimate !== null };
}
