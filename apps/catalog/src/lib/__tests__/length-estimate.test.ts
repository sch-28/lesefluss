import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	BYTES_PER_WORD,
	effectiveLength,
	estimateWords,
	settledEstimate,
} from "../length-estimate.js";
import { calibrate } from "./calibrate.js";

/**
 * 47 Gutenberg books stratified by text size: plain-text bytes from the RDF
 * catalog, words counted from the EPUB on the pglaf mirror with lib/word-count.ts.
 */
const sample: { id: number; language: string; textBytes: number; words: number }[] = JSON.parse(
	readFileSync(new URL("./fixtures-length-calibration.json", import.meta.url), "utf8"),
);

describe("calibrate", () => {
	it("takes the median bytes per word and the median relative error", () => {
		const result = calibrate([
			{ textBytes: 600, words: 100 },
			{ textBytes: 1200, words: 200 },
			{ textBytes: 900, words: 100 },
		]);
		expect(result.bytesPerWord).toBe(6);
		expect(result.medianError).toBe(0);
	});

	it("ignores empty samples and refuses to calibrate on nothing", () => {
		expect(
			calibrate([
				{ textBytes: 0, words: 10 },
				{ textBytes: 600, words: 100 },
			]).bytesPerWord,
		).toBe(6);
		expect(() => calibrate([])).toThrow();
	});

	it("reproduces the shipped factors from the recorded sample", () => {
		const english = calibrate(sample.filter((s) => s.language === "en"));
		const other = calibrate(sample.filter((s) => s.language !== "en"));
		expect(english.bytesPerWord).toBeCloseTo(BYTES_PER_WORD.en, 1);
		expect(other.bytesPerWord).toBeCloseTo(BYTES_PER_WORD.other, 1);
	});

	it("keeps the shipped estimate within 15% on every sampled book", () => {
		for (const s of sample) {
			const estimate = estimateWords(s.textBytes, s.language) ?? 0;
			expect(Math.abs(estimate - s.words) / s.words, `#${s.id}`).toBeLessThan(0.15);
		}
	});
});

describe("estimateWords", () => {
	it("uses the English factor for English and the other one elsewhere", () => {
		expect(estimateWords(5900, "en")).toBe(1000);
		expect(estimateWords(7000, "de")).toBe(1000);
		expect(estimateWords(7000, null)).toBe(1000);
	});

	it("has no estimate without a text edition", () => {
		expect(estimateWords(undefined, "en")).toBeNull();
		expect(estimateWords(0, "en")).toBeNull();
	});
});

describe("settledEstimate", () => {
	it("keeps the stored estimate through changes of 1% or less", () => {
		expect(settledEstimate(10_000, 10_100)).toBe(10_000);
		expect(settledEstimate(10_000, 9_900)).toBe(10_000);
	});

	it("takes a new estimate that moved by more, or that is the first or the last", () => {
		expect(settledEstimate(10_000, 10_101)).toBe(10_101);
		expect(settledEstimate(null, 10_000)).toBe(10_000);
		expect(settledEstimate(10_000, null)).toBeNull();
	});
});

describe("effectiveLength", () => {
	it("prefers the exact count over the estimate", () => {
		expect(effectiveLength(80_000, 95_000)).toEqual({
			wordCount: 80_000,
			wordCountEstimated: false,
		});
	});

	it("falls back to the estimate and says so", () => {
		expect(effectiveLength(null, 95_000)).toEqual({ wordCount: 95_000, wordCountEstimated: true });
	});

	it("is unknown when neither exists", () => {
		expect(effectiveLength(null, null)).toEqual({ wordCount: null, wordCountEstimated: false });
	});
});
