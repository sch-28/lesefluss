import { wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { makeBook } from "../../../../test/book-fixture";
import { menuOpenLabel } from "../use-book-actions";

describe("menuOpenLabel", () => {
	it("says Start for an unread book and Continue for one in progress", () => {
		expect(
			menuOpenLabel(makeBook({ wordPosition: wordPos(0), wordCount: 1000, finishedAt: null })),
		).toBe("Start reading");
		expect(
			menuOpenLabel(makeBook({ wordPosition: wordPos(400), wordCount: 1000, finishedAt: null })),
		).toBe("Continue reading");
	});

	it("says Open reader for a finished book", () => {
		expect(
			menuOpenLabel(makeBook({ wordPosition: wordPos(1000), wordCount: 1000, finishedAt: 1 })),
		).toBe("Open reader");
	});
});
