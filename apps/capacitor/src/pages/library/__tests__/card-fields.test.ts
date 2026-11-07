import { bookPace, type SpeedModel, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { summariseBookReading } from "../../../services/stats/book-summary";
import { makeBook } from "../../../test/book-fixture";
import { formatReadingTime } from "../../../utils/reading-time";
import {
	cardFieldValues,
	cardTimeLeft,
	DEFAULT_CARD_FIELDS,
	parseCardFields,
	toggleCardField,
} from "../card-fields";
import { buildLibraryItems } from "../sort-filter";

const model = { pace: { wpm: 200, source: "measured" }, books: {} } as unknown as SpeedModel;
const ctx = { seriesMemberships: new Map(), collections: new Map() };
const itemOf = (over: Parameters<typeof makeBook>[0]) =>
	buildLibraryItems([makeBook({ id: "b1", ...over })], [], new Map(), 0, new Map(), model)[0];

describe("card fields", () => {
	it("keeps the defaults for a surface it cannot read and drops ids it does not know", () => {
		expect(parseCardFields(null)).toEqual(DEFAULT_CARD_FIELDS);
		expect(parseCardFields("{broken")).toEqual(DEFAULT_CARD_FIELDS);
		expect(parseCardFields('{"grid":["rating","shelfmark","author"]}')).toEqual({
			grid: ["author", "rating"],
			list: DEFAULT_CARD_FIELDS.list,
		});
		expect(parseCardFields('{"grid":[],"list":["words"]}')).toEqual({ grid: [], list: ["words"] });
	});

	it("turns a field on in the card's own order, and off again", () => {
		expect(toggleCardField(["rating"], "author")).toEqual(["author", "rating"]);
		expect(toggleCardField(["author", "rating"], "author")).toEqual(["rating"]);
	});

	it("shows time left only for a book under way, plainly and as the stats card has it", () => {
		expect(cardTimeLeft(itemOf({ wordCount: 60_000, wordPosition: wordPos(0) }))).toBe("");
		expect(
			cardTimeLeft(itemOf({ wordCount: 60_000, wordPosition: wordPos(60_000), finishedAt: 5 })),
		).toBe("");

		const book = makeBook({ id: "b1", wordCount: 60_000, wordPosition: wordPos(20_000) });
		const shown = cardTimeLeft(itemOf(book));
		const stats = summariseBookReading(book, bookPace(model, book.id)).minutesLeft;
		expect(stats).not.toBeNull();
		expect(shown).toBe(`Left ${formatReadingTime(stats ?? 0)}`);
		expect(shown).not.toContain("~");
	});

	it("takes each text field's value from the table's cell", () => {
		const item = itemOf({ author: "Ursula K. Le Guin", wordCount: 1234, status: "finished" });
		expect(cardFieldValues(item, ctx, ["author", "words", "status", "rating"])).toEqual({
			author: "Ursula K. Le Guin",
			words: (1234).toLocaleString(),
			status: "Finished",
		});
	});
});
