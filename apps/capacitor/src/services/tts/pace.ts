/**
 * Speech engines take a rate multiplier, but readers think in words per
 * minute. Each voice's pace at rate 1 is learned from what it actually speaks,
 * so a target in WPM lands close to that speed whatever the voice.
 */

/** A typical engine voice at rate 1, until this voice has been measured. */
const DEFAULT_BASELINE_WPM = 170;
const MIN_RATE = 0.5;
const MAX_RATE = 3;
const WINDOW_MS = 60_000;
const MIN_SAMPLE_MS = 15_000;
// A word gap longer than this is a pause or a skip, not speech.
const MAX_STEP_MS = 4_000;
const MAX_STEP_WORDS = 30;
// New measurements move the learned pace this far; one odd paragraph can't swing it.
const BASELINE_WEIGHT = 0.3;

export function rateFor(targetWpm: number, baselineWpm: number): number {
	const rate = targetWpm / baselineWpm;
	return Math.round(Math.min(MAX_RATE, Math.max(MIN_RATE, rate)) * 100) / 100;
}

export function nextBaseline(previous: number, measuredWpm: number, rate: number): number {
	return Math.round(previous + (measuredWpm / rate - previous) * BASELINE_WEIGHT);
}

/** Words spoken per minute over the last minute of continuous speech. */
export class PaceMeter {
	private samples: { at: number; words: number; ms: number }[] = [];
	private last: { word: number; at: number } | null = null;

	record(word: number, at: number): void {
		const last = this.last;
		this.last = { word, at };
		if (!last) return;
		const words = word - last.word;
		const ms = at - last.at;
		if (words <= 0 || words > MAX_STEP_WORDS || ms <= 0 || ms > MAX_STEP_MS) return;
		this.samples.push({ at, words, ms });
		this.samples = this.samples.filter((s) => at - s.at <= WINDOW_MS);
	}

	/** Breaks the chain at a pause, skip or rate change so the gap is not counted. */
	reset(): void {
		this.last = null;
		this.samples = [];
	}

	wpm(): number | null {
		let words = 0;
		let ms = 0;
		for (const s of this.samples) {
			words += s.words;
			ms += s.ms;
		}
		return ms >= MIN_SAMPLE_MS ? Math.round(words / (ms / 60_000)) : null;
	}
}

const BASELINE_KEY = "tts-baseline:";

/** Per-device convenience: losing it only means re-learning the voice. */
export function loadBaseline(voice: string | null): number {
	try {
		const stored = Number(localStorage.getItem(BASELINE_KEY + (voice ?? "default")));
		return stored > 0 ? stored : DEFAULT_BASELINE_WPM;
	} catch {
		return DEFAULT_BASELINE_WPM;
	}
}

export function saveBaseline(voice: string | null, wpm: number): void {
	try {
		localStorage.setItem(BASELINE_KEY + (voice ?? "default"), String(wpm));
	} catch {
		// Storage unavailable: the voice is measured again next time.
	}
}
