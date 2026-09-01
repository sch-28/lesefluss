import { describe, expect, it } from "vitest";
import { emptyParseStats, parseLine } from "../parse.js";

/** Fixtures mirror the field layout of real kaikki JSONL lines. */
const line = (entry: unknown) => JSON.stringify(entry);

const RAN_SYMBOL = line({
	word: "ran",
	pos: "symbol",
	lang_code: "en",
	senses: [{ glosses: ["ISO 639-3 language code for Riantana."] }],
});

const RAN_VERB = line({
	word: "ran",
	pos: "verb",
	lang_code: "en",
	senses: [{ glosses: ["simple past of run"], form_of: [{ word: "run" }] }],
});

const SPRUECHE = line({
	word: "Sprüche",
	pos: "noun",
	lang_code: "de",
	senses: [{ glosses: ["Nominativ Plural des Substantivs Spruch"], form_of: [{ word: "Spruch" }] }],
});

const GIFT_DE = line({
	word: "Gift",
	pos: "noun",
	lang_code: "de",
	senses: [
		{ glosses: ["Substanz, die Lebewesen schädigt"], examples: [{ text: "ein tödliches Gift" }] },
	],
});

describe("parseLine", () => {
	it("drops junk parts of speech so they cannot outrank real senses", () => {
		const stats = emptyParseStats();
		expect(parseLine(RAN_SYMBOL, "en", 0, stats)).toHaveLength(0);
		expect(stats.skippedPos).toBe(1);

		const rows = parseLine(RAN_VERB, "en", 0, stats);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.pos).toBe("verb");
		expect(rows[0]?.posRank).toBe(0);
	});

	it("keeps the lemma pointer for inflected forms, normalized", () => {
		const rows = parseLine(SPRUECHE, "de", 0, emptyParseStats());
		expect(rows[0]?.wordKey).toBe("sprüche");
		expect(rows[0]?.word).toBe("Sprüche");
		expect(rows[0]?.formOf).toBe("spruch");
		expect(rows[0]?.gloss).toBe("Nominativ Plural des Substantivs Spruch");
	});

	it("preserves original casing while keying on the normalized form", () => {
		const rows = parseLine(GIFT_DE, "de", 0, emptyParseStats());
		expect(rows[0]?.word).toBe("Gift");
		expect(rows[0]?.wordKey).toBe("gift");
		expect(rows[0]?.lang).toBe("de");
		expect(rows[0]?.example).toBe("ein tödliches Gift");
	});

	it("drops entries belonging to another language", () => {
		const stats = emptyParseStats();
		// The German edition carries entries about other languages too.
		expect(parseLine(GIFT_DE, "en", 0, stats)).toHaveLength(0);
		expect(stats.skippedLang).toBe(1);
	});

	it("caps senses per entry and numbers them consecutively", () => {
		const many = line({
			word: "set",
			pos: "noun",
			lang_code: "en",
			senses: Array.from({ length: 20 }, (_, i) => ({ glosses: [`sense ${i}`] })),
		});
		const stats = emptyParseStats();
		const rows = parseLine(many, "en", 0, stats);
		expect(rows).toHaveLength(6);
		expect(rows.map((r) => r.senseIndex)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(stats.truncatedSenses).toBe(1);
	});

	it("drops a self-referential lemma pointer", () => {
		const selfRef = line({
			word: "run",
			pos: "verb",
			lang_code: "en",
			senses: [{ glosses: ["to move quickly"], form_of: [{ word: "Run" }] }],
		});
		expect(parseLine(selfRef, "en", 0, emptyParseStats())[0]?.formOf).toBeNull();
	});

	it("survives malformed JSON without throwing", () => {
		const stats = emptyParseStats();
		expect(parseLine("{not json", "en", 0, stats)).toHaveLength(0);
		expect(stats.skippedMalformed).toBe(1);
	});

	it("drops senses with no gloss and de-duplicates repeats", () => {
		const dupes = line({
			word: "thing",
			pos: "noun",
			lang_code: "en",
			senses: [{ glosses: ["an object"] }, { tags: ["obsolete"] }, { glosses: ["an object"] }],
		});
		expect(parseLine(dupes, "en", 0, emptyParseStats())).toHaveLength(1);
	});
});
