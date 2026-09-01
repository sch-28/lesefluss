// @vitest-environment node
//
// Exercises the real lookup route against Postgres.
// Run locally with:
//   DATABASE_URL=postgres://... pnpm --filter @lesefluss/catalog test

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DictionaryLookupResponse } from "../../lib/dict-row.js";

const hasDb = Boolean(process.env.DATABASE_URL);

// Imported lazily: src/env.ts throws at module load when DATABASE_URL is unset,
// which would fail this file outright instead of skipping it.
let db: typeof import("../../db/index.js").db;
let dictionaryRoute: typeof import("../../routes/dictionary.js").dictionaryRoute;

/**
 * Unique per run so the fixtures can never collide with imported data.
 * Letters only: normalizeWord strips digits, so a hex nonce would not survive
 * the round trip through the lookup route.
 */
const NONCE = randomUUID()
	.replace(/[^0-9a-f]/g, "")
	.slice(0, 12)
	.replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)] as string);
const HOMOGRAPH = `zzhomo${NONCE}`;
const INFLECTED = `zzinfl${NONCE}`;
const LEMMA = `zzlemma${NONCE}`;
const JUNKFIRST = `zzjunk${NONCE}`;
const SELFREF = `zzself${NONCE}`;
const CASED = `zzcased${NONCE}`;
const CHAINED = `zzchain${NONCE}`;
const MIDPOINT = `zzmid${NONCE}`;
const CHAINEND = `zzend${NONCE}`;
const MIXED = `zzmixed${NONCE}`;
const AMBIG = `zzambig${NONCE}`;
const VERBFORM = `zzvform${NONCE}`;
const POSTGT = `zzpostgt${NONCE}`;

type Row = {
	lang: string;
	word: string;
	pos: string;
	posRank: number;
	entryIndex: number;
	senseIndex: number;
	gloss: string;
	formOf?: string | null;
};

const row = (r: Row) => ({ ...r, formOf: r.formOf ?? null });

const FIXTURES: Row[] = [
	// Same key in both languages — proves the chain decides which one answers.
	row({
		lang: "de",
		word: "Homo",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "german sense",
	}),
	row({
		lang: "en",
		word: "homo",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "english sense",
	}),
	// Inflected form whose only sense is a pointer at the lemma.
	row({
		lang: "de",
		word: "Inflected",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "Plural des Substantivs Lemma",
		formOf: LEMMA,
	}),
	row({
		lang: "de",
		word: "Lemma",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "the real definition",
	}),
	// A junk part of speech ranked behind a useful one, as with "ran".
	row({
		lang: "en",
		word: "Junk",
		pos: "symbol",
		posRank: 4,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "ISO code for nothing",
	}),
	row({
		lang: "en",
		word: "Junk",
		pos: "verb",
		posRank: 0,
		entryIndex: 1,
		senseIndex: 0,
		gloss: "to discard",
	}),
	// A pointer at itself must not loop.
	row({
		lang: "en",
		word: "Self",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "points at itself",
		formOf: SELFREF,
	}),
	// Noun and verb forms separated only by casing, as with Bäume / bäume.
	row({
		lang: "de",
		word: `zzCased${NONCE}`,
		pos: "verb",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "verb reading",
		formOf: CHAINEND,
	}),
	row({
		lang: "de",
		word: `ZzCased${NONCE}`,
		pos: "noun",
		posRank: 0,
		entryIndex: 1,
		senseIndex: 0,
		gloss: "noun reading",
		formOf: CHAINEND,
	}),
	// Pointer chain: Chained -> Midpoint -> End, as with Bäume -> Bäumen -> Baum.
	row({
		lang: "de",
		word: "Chained",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "Plural des Substantivs End",
		formOf: MIDPOINT,
	}),
	row({
		lang: "de",
		word: "Midpoint",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "Dativ Plural des Substantivs End",
		formOf: CHAINEND,
	}),
	row({
		lang: "de",
		word: "End",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "the actual definition",
	}),
	// Pointer on top with a real definition below — as with "wolves" (the football
	// club is a real sense) and "ran" (a rare nautical noun). Requiring every row
	// to be a pointer stranded both on "plural of ...".
	row({
		lang: "en",
		word: "Mixed",
		pos: "verb",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "simple past of Ambig",
		formOf: AMBIG,
	}),
	row({
		lang: "en",
		word: "Mixed",
		pos: "noun",
		posRank: 0,
		entryIndex: 1,
		senseIndex: 0,
		gloss: "an unrelated rare noun",
	}),
	// The hop target holds a pointer and a real definition, as "bäumen" does.
	// Landing on the pointer drifts to a word the note never named.
	row({
		lang: "en",
		word: "Ambig",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "plural of something else",
		formOf: CHAINEND,
	}),
	row({
		lang: "en",
		word: "Ambig",
		pos: "verb",
		posRank: 0,
		entryIndex: 1,
		senseIndex: 0,
		gloss: "the verb the pointer meant",
	}),
	// A verb participle pointing at a key shared by a noun and a verb, as
	// "gelaufen" -> the verb "laufen" versus the noun "Laufen" (the sport).
	row({
		lang: "en",
		word: "Verbform",
		pos: "verb",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "past participle of PosTgt",
		formOf: POSTGT,
	}),
	row({
		lang: "en",
		word: "PosTgt",
		pos: "noun",
		posRank: 0,
		entryIndex: 0,
		senseIndex: 0,
		gloss: "the noun reading",
	}),
	row({
		lang: "en",
		word: "PosTgt",
		pos: "verb",
		posRank: 0,
		entryIndex: 1,
		senseIndex: 0,
		gloss: "the verb reading",
	}),
];

const KEYS = [
	HOMOGRAPH,
	INFLECTED,
	LEMMA,
	JUNKFIRST,
	SELFREF,
	CASED,
	CHAINED,
	MIDPOINT,
	CHAINEND,
	MIXED,
	AMBIG,
	VERBFORM,
	POSTGT,
];

async function get(word: string, lang?: string): Promise<DictionaryLookupResponse> {
	const query = lang
		? `?w=${encodeURIComponent(word)}&lang=${lang}`
		: `?w=${encodeURIComponent(word)}`;
	const res = await dictionaryRoute.request(query);
	expect(res.status).toBe(200);
	return (await res.json()) as DictionaryLookupResponse;
}

describe.skipIf(!hasDb)("dictionary lookup (integration)", () => {
	beforeAll(async () => {
		({ db } = await import("../../db/index.js"));
		({ dictionaryRoute } = await import("../../routes/dictionary.js"));

		// Explicit per-fixture mapping. A default branch would silently file any
		// future fixture under the wrong key and make its test pass vacuously.
		const KEY_BY_WORD: Record<string, string> = {
			Homo: HOMOGRAPH,
			homo: HOMOGRAPH,
			Inflected: INFLECTED,
			Lemma: LEMMA,
			Junk: JUNKFIRST,
			Self: SELFREF,
			Chained: CHAINED,
			Midpoint: MIDPOINT,
			End: CHAINEND,
			[`zzCased${NONCE}`]: CASED,
			[`ZzCased${NONCE}`]: CASED,
			Mixed: MIXED,
			Ambig: AMBIG,
			Verbform: VERBFORM,
			PosTgt: POSTGT,
		};
		const keyFor = (r: Row) => {
			const key = KEY_BY_WORD[r.word];
			if (!key) throw new Error(`fixture "${r.word}" has no key mapping`);
			return key;
		};

		for (const r of FIXTURES) {
			await db.execute(sql`
				INSERT INTO catalog_dict_entry
					(lang, word_key, word, entry_index, pos, pos_rank, sense_index, gloss, example, form_of)
				VALUES (${r.lang}, ${keyFor(r)}, ${r.word}, ${r.entryIndex}, ${r.pos}, ${r.posRank},
				        ${r.senseIndex}, ${r.gloss}, NULL, ${r.formOf})
			`);
		}
	});

	afterAll(async () => {
		await db.execute(
			sql`DELETE FROM catalog_dict_entry WHERE word_key = ANY(${sql.param(KEYS)}::text[])`,
		);
	});

	it("answers from the requested language first", async () => {
		const de = await get(HOMOGRAPH, "de");
		expect(de.entry?.lang).toBe("de");
		expect(de.entry?.senses[0]?.gloss).toBe("german sense");

		const en = await get(HOMOGRAPH, "en");
		expect(en.entry?.lang).toBe("en");
		expect(en.entry?.senses[0]?.gloss).toBe("english sense");
	});

	it("falls back down the chain and reports which language answered", async () => {
		const res = await get(HOMOGRAPH);
		expect(res.requested).toBeNull();
		expect(res.entry?.lang).toBe("en");
		expect(res.chain[0]).toBe("en");
	});

	it("never mixes senses from two languages", async () => {
		const res = await get(HOMOGRAPH, "de");
		const glosses = res.entry?.senses.map((s) => s.gloss) ?? [];
		expect(glosses).toContain("german sense");
		expect(glosses).not.toContain("english sense");
	});

	it("tolerates region tags and free-text language values", async () => {
		for (const lang of ["de-AT", "DE", "Deutsch", "de_CH"]) {
			const res = await get(HOMOGRAPH, lang);
			expect(res.requested, `lang=${lang}`).toBe("de");
			expect(res.entry?.senses[0]?.gloss, `lang=${lang}`).toBe("german sense");
		}
	});

	it("falls back to the default chain for unusable language values", async () => {
		const res = await get(HOMOGRAPH, "!!!nonsense");
		expect(res.requested).toBeNull();
		expect(res.entry?.lang).toBe("en");
	});

	it("resolves an inflected form to its lemma and keeps the inflection note", async () => {
		const res = await get(INFLECTED, "de");
		expect(res.lemma?.note).toBe("Plural des Substantivs Lemma");
		expect(res.entry?.word).toBe("Lemma");
		expect(res.entry?.senses[0]?.gloss).toBe("the real definition");
	});

	it("does not loop on a self-referential lemma pointer", async () => {
		const res = await get(SELFREF, "en");
		expect(res.entry?.word).toBe("Self");
	});

	it("orders meaningful senses ahead of junk parts of speech", async () => {
		const res = await get(JUNKFIRST, "en");
		expect(res.entry?.senses[0]?.gloss).toBe("to discard");
	});

	it("returns 200 with a null entry for an unknown word", async () => {
		const res = await get(`zzmissing${NONCE}`);
		expect(res.entry).toBeNull();
		expect(res.lemma).toBeNull();
	});

	it("rejects a request with no usable word", async () => {
		const res = await dictionaryRoute.request("?w=1234");
		expect(res.status).toBe(400);
	});

	it("prefers the sense whose casing matches the tapped word", async () => {
		// Bäume (trees) and bäume (verb) share a folded key; only casing separates them.
		expect((await get(`ZzCased${NONCE}`, "de")).lemma?.note).toBe("noun reading");
		expect((await get(`zzCased${NONCE}`, "de")).lemma?.note).toBe("verb reading");
	});

	it("follows a chain of inflection pointers to the real definition", async () => {
		const res = await get(CHAINED, "de");
		expect(res.entry?.word).toBe("End");
		expect(res.entry?.senses[0]?.gloss).toBe("the actual definition");
		// The note names the form the reader tapped, not an intermediate hop.
		expect(res.lemma?.note).toBe("Plural des Substantivs End");
	});

	it("follows a pointer on top even when the word has other real senses", async () => {
		// "wolves" also names the football club; "ran" is also a nautical noun.
		// Requiring every row to be a pointer left both stranded on "plural of".
		const res = await get(MIXED, "en");
		expect(res.lemma?.note).toBe("simple past of Ambig");
		expect(res.entry?.word).toBe("Ambig");
	});

	it("lands on a real definition rather than another pointer when hopping", async () => {
		// The "bäume" case: the target held both, and taking the pointer drifted
		// to a word the inflection note did not name.
		const res = await get(MIXED, "en");
		expect(res.entry?.senses[0]?.gloss).toBe("the verb the pointer meant");
	});

	it("resolves to the part of speech the inflected form had", async () => {
		// The "gelaufen" case: a verb participle resolved to the noun "Laufen"
		// (the sport) instead of the verb "laufen" (to run).
		const res = await get(VERBFORM, "en");
		expect(res.entry?.senses[0]?.gloss).toBe("the verb reading");
	});

	it("always carries the CC BY-SA attribution", async () => {
		const res = await get(HOMOGRAPH, "de");
		expect(res.attribution.license).toBe("CC BY-SA 4.0");
		expect(res.attribution.source).toBe("Wiktionary");
	});
});
