import { readingProgress } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { formatPercent } from "../format-percent";

describe("formatPercent", () => {
	it("rounds a whole percent like readingProgress, so every screen shows the same figure", () => {
		const book = { wordCount: 1000, wordPosition: 15 };
		expect(formatPercent((book.wordPosition / book.wordCount) * 100)).toBe(
			`${readingProgress(book)}%`,
		);
		expect(formatPercent(19.5)).toBe("20%");
	});

	it("shows one decimal for goal amounts and drops a trailing zero", () => {
		expect(formatPercent(2.74, 1)).toBe("2.7%");
		expect(formatPercent(3, 1)).toBe("3%");
		expect(formatPercent(2.96, 1)).toBe("3%");
	});

	it("stays within 0 to 100", () => {
		expect(formatPercent(-0.2)).toBe("0%");
		expect(formatPercent(100.4, 1)).toBe("100%");
	});
});
