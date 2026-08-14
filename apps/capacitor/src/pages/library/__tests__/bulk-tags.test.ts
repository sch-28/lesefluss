import { describe, expect, it } from "vitest";
import type { Book } from "../../../services/db/schema";
import {
	applyTagIntents,
	hasPendingIntent,
	nextIntent,
	type TagIntent,
	tagPatchFor,
	tagRows,
} from "../bulk-tags";

function book(tags: string[] | string | null): Book {
	return {
		id: "b",
		title: "T",
		tags: typeof tags === "string" || tags === null ? tags : JSON.stringify(tags),
	} as Book;
}

const intents = (entries: Record<string, TagIntent>) => new Map(Object.entries(entries));

describe("tagRows", () => {
	it("marks a tag every selected book carries as all", () => {
		const rows = tagRows([book(["sci-fi"]), book(["sci-fi"])], []);
		expect(rows).toEqual([{ tag: "sci-fi", state: "all", count: 2 }]);
	});

	it("marks a tag only some carry as some, with the count", () => {
		const rows = tagRows([book(["sci-fi"]), book([])], []);
		expect(rows).toEqual([{ tag: "sci-fi", state: "some", count: 1 }]);
	});

	// So an existing tag can be applied without retyping it.
	it("offers library tags the selection does not have, as none", () => {
		const rows = tagRows([book([])], ["poetry"]);
		expect(rows).toEqual([{ tag: "poetry", state: "none", count: 0 }]);
	});

	// Asserting the whole rows, not just the keys: a Map makes the keys unique for
	// free, so a key-only assertion cannot fail and would miss the real risk, which
	// is a library tag resetting the count of one the selection already carries.
	it("sorts alphabetically and keeps the count of a library tag already in use", () => {
		expect(tagRows([book(["zebra", "apple"])], ["apple", "mango"])).toEqual([
			{ tag: "apple", state: "all", count: 1 },
			{ tag: "mango", state: "none", count: 0 },
			{ tag: "zebra", state: "all", count: 1 },
		]);
	});

	// `parseBookTags` is deliberately tolerant, and one bad row must not poison
	// the whole sheet.
	it("ignores a book whose tags column is malformed", () => {
		expect(tagRows([book("not json"), book(["ok"])], [])).toEqual([
			{ tag: "ok", state: "some", count: 1 },
		]);
	});

	it("counts a duplicated tag on one book once", () => {
		expect(tagRows([book(["dup", "dup"])], [])).toEqual([{ tag: "dup", state: "all", count: 1 }]);
	});
});

describe("nextIntent", () => {
	// The first tap does the obvious thing, whatever the current mix.
	it("offers add first when the tag is missing somewhere", () => {
		expect(nextIntent("none", "leave")).toBe("add");
		expect(nextIntent("some", "leave")).toBe("add");
	});

	it("offers remove first when every book already has it", () => {
		expect(nextIntent("all", "leave")).toBe("remove");
	});

	it("cycles back to leave", () => {
		expect(nextIntent("none", "add")).toBe("remove");
		expect(nextIntent("none", "remove")).toBe("leave");
		expect(nextIntent("all", "remove")).toBe("add");
		expect(nextIntent("all", "add")).toBe("leave");
	});
});

describe("applyTagIntents", () => {
	it("keeps the book's existing order and appends what is added", () => {
		expect(applyTagIntents(["b", "a"], intents({ c: "add" }))).toEqual(["b", "a", "c"]);
	});

	it("does not duplicate a tag the book already has", () => {
		expect(applyTagIntents(["a"], intents({ a: "add" }))).toEqual(["a"]);
	});

	it("removes only what was asked", () => {
		expect(applyTagIntents(["a", "b"], intents({ a: "remove" }))).toEqual(["b"]);
	});

	it("leaves untouched tags alone", () => {
		expect(applyTagIntents(["a"], intents({ b: "leave" }))).toEqual(["a"]);
	});
});

describe("tagPatchFor", () => {
	// Every write stamps metadataUpdatedAt and enlarges the sync payload, so a
	// book that already matches must not be written at all.
	it("reports no change when the book already matches every intent", () => {
		expect(tagPatchFor(book(["a"]), intents({ a: "add" }))).toEqual({ kind: "unchanged" });
		expect(tagPatchFor(book([]), intents({ a: "remove" }))).toEqual({ kind: "unchanged" });
	});

	it("serializes the new list", () => {
		expect(tagPatchFor(book(["a"]), intents({ b: "add" }))).toEqual({
			kind: "write",
			tags: JSON.stringify(["a", "b"]),
		});
	});

	// `serializeBookTags` returns null for an empty list, so the column is
	// cleared rather than left holding "[]".
	it("writes null when the last tag is removed", () => {
		expect(tagPatchFor(book(["a"]), intents({ a: "remove" }))).toEqual({
			kind: "write",
			tags: null,
		});
	});

	// Sized so the book fits with room to spare and the *added* tag is what tips
	// it over. An oversized fixture would pass even if the addition contributed
	// nothing to the measurement.
	const nearCap = Array.from({ length: 62 }, (_, i) => `tag-number-${i}-padding-padding`);

	it("fits a book sized just under the cap", () => {
		expect(
			tagPatchFor(book(nearCap), intents({ "tag-number-0-padding-padding": "remove" })),
		).toEqual({ kind: "write", tags: JSON.stringify(nearCap.slice(1)) });
	});

	it("refuses a tag that would push the book past the length cap", () => {
		// 1975 chars serialized; this tag takes it to 2009, one nudge over 2000.
		expect(
			tagPatchFor(book(nearCap), intents({ "one-more-tag-with-extra-padding": "add" })),
		).toEqual({ kind: "overflow" });
	});

	it("accepts a tag that still fits", () => {
		expect(tagPatchFor(book(nearCap), intents({ tiny: "add" }))).toEqual({
			kind: "write",
			tags: JSON.stringify([...nearCap, "tiny"]),
		});
	});

	// Otherwise the one action that could bring an over-cap book back under the
	// limit would be the only one refused.
	it("still lets an over-cap book have tags removed", () => {
		const over = Array.from({ length: 120 }, (_, i) => `tag-number-${i}-padding-padding`);
		const patch = tagPatchFor(book(over), intents({ "tag-number-0-padding-padding": "remove" }));
		expect(patch).toEqual({ kind: "write", tags: JSON.stringify(over.slice(1)) });
	});
});

describe("hasPendingIntent", () => {
	it("is false when every row is left alone", () => {
		expect(hasPendingIntent(intents({ a: "leave", b: "leave" }))).toBe(false);
	});

	it("is true as soon as one row would act", () => {
		expect(hasPendingIntent(intents({ a: "leave", b: "add" }))).toBe(true);
	});
});
