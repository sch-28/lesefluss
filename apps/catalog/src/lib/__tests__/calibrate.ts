/**
 * The calibration tool behind BYTES_PER_WORD in ../length-estimate.ts; the
 * service never calls it. Rerun it over a fresh sample (plain-text bytes from the RDF catalog,
 * words counted with lib/word-count.ts) when the factors need checking.
 */

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const lower = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
	const upper = sorted[Math.floor(sorted.length / 2)] ?? 0;
	return (lower + upper) / 2;
}

/**
 * Bytes-per-word factor for samples of known length, and the median relative
 * error of estimating each sample with it. Median, not mean: a few books with
 * long front matter or another script would drag a mean around.
 */
export function calibrate(samples: { textBytes: number; words: number }[]): {
	bytesPerWord: number;
	medianError: number;
} {
	const usable = samples.filter((s) => s.textBytes > 0 && s.words > 0);
	if (usable.length === 0) throw new Error("no usable samples");
	const bytesPerWord = median(usable.map((s) => s.textBytes / s.words));
	const medianError = median(
		usable.map((s) => Math.abs(s.textBytes / bytesPerWord - s.words) / s.words),
	);
	return { bytesPerWord, medianError };
}
