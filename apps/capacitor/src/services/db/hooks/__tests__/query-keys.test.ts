import { describe, expect, it } from "vitest";
import { bookKeys, isBookPayloadKey } from "../query-keys";

describe("isBookPayloadKey", () => {
	it("names a book's text and word index, which leaving the reader leaves cached", () => {
		expect(isBookPayloadKey(bookKeys.content("b1"))).toBe(true);
		expect(isBookPayloadKey(bookKeys.wordIndex("b1"))).toBe(true);
	});

	it("leaves the library list and a book's row to refresh", () => {
		expect(isBookPayloadKey(bookKeys.all)).toBe(false);
		expect(isBookPayloadKey(bookKeys.detail("b1"))).toBe(false);
		expect(isBookPayloadKey(bookKeys.highlights("b1"))).toBe(false);
	});
});
