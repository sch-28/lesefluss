import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { buildChain, normalizeLang } from "../dict/chain.js";
import { DICT_LANGUAGES } from "../dict/languages.js";
import { foldApostrophes, normalizeWord } from "../dict/normalize.js";
import { getDictCounts } from "../lib/dict-counts.js";
import {
	DICT_ATTRIBUTION,
	type DictionaryLookupResponse,
	type DictRow,
	mapDictEntry,
} from "../lib/dict-row.js";

/** Enough rows to fill the drawer and still see whether every sense is a pointer. */
const ROW_LIMIT = 12;

/** Inflection pointers chain in German (Bäume -> Bäumen -> Baum). Bounded to stop cycles. */
const MAX_LEMMA_HOPS = 2;

/**
 * `surface` is the word as it appeared in the book, original casing intact.
 *
 * Casing is the only thing separating some German homographs once the key is
 * folded: the noun plural "Bäume" and the verb form "bäume" share a key, and
 * without this tiebreak a reader tapping the trees gets "to rear up on its hind
 * legs". Preferring an exact surface match costs nothing where casing is
 * uninformative, as in English.
 */
async function lookup(
	wordKey: string,
	chain: string[],
	surface: string,
	/**
	 * Set only when following a pointer, and it changes the ranking rather than
	 * merely weighting it: the lemma's orthography is unknown so the casing
	 * tiebreak is useless, and instead we demote further pointers and any part of
	 * speech the inflected form did not have. The primary lookup must NOT do this
	 * — there the pointer is often the sense the reader wants ("ran" -> "simple
	 * past of run"), and demoting it surfaces a rare noun instead.
	 */
	from?: { pos: string },
): Promise<DictRow[]> {
	// `chain` is bound, not interpolated: it originates from validated config
	// today, but a lookup route is not the place to rely on that staying true.
	// sql.param is required — a bare array in a drizzle template expands to a
	// record, which ANY() and array_position() both reject.
	const langs = sql`${sql.param(chain)}::text[]`;
	const result = await db.execute<DictRow>(sql`
		SELECT lang, word, pos, gloss, example, form_of
		  FROM catalog_dict_entry
		 WHERE word_key = ${wordKey} AND lang = ANY(${langs})
		 ORDER BY array_position(${langs}, lang),
		          (word <> ${surface}),
		          ${from ? sql`(form_of IS NOT NULL), (pos <> ${from.pos}),` : sql``}
		          pos_rank, entry_index, sense_index
		 LIMIT ${ROW_LIMIT}
	`);
	return result.rows;
}

export const dictionaryRoute = new Hono()
	// GET /dictionary?w=Sprüche&lang=de
	//   200 { entry, lemma, ... }   — entry is null when the word is unknown
	//   400 missing word
	.get("/", async (c) => {
		const raw = c.req.query("w") ?? "";
		const wordKey = normalizeWord(raw);
		if (!wordKey) return c.json({ error: "missing w" }, 400);

		const requested = normalizeLang(c.req.query("lang"));
		const chain = buildChain(requested);

		// Case is kept (it separates "Bäume" from "bäume") but apostrophes are
		// folded, so a book's typographic ’ still matches Wiktionary's ASCII '.
		const surface = foldApostrophes(raw.trim());
		let rows = await lookup(wordKey, chain, surface);
		let lemma: DictionaryLookupResponse["lemma"] = null;

		// A pointer at the top means the best-ranked reading of this word is an
		// inflected form, and the reader would otherwise get "plural of Spruch" and
		// nothing else. Follow it in the answering language only — a German
		// inflection must never resolve to an English lemma.
		//
		// Keyed on the top row, not on every row: "wolves" also carries proper-noun
		// senses (the football club, the city) that are real definitions, and
		// requiring every row to be a pointer would strand it on "plural of wolf".
		//
		// German chains these: Bäume points at Bäumen, which points at Baum. Two
		// hops reach the real entry; the bound stops a cycle from looping.
		const seen = new Set([wordKey]);
		for (let hop = 0; hop < MAX_LEMMA_HOPS; hop++) {
			const head = rows[0];
			if (!head?.form_of) break;
			if (seen.has(head.form_of)) break;
			seen.add(head.form_of);

			// The lemma's orthography is unknown, so the casing tiebreak cannot help
			// here. Rank by what the pointer tells us instead: a real definition
			// rather than another pointer, and the same part of speech the inflected
			// form had. Without the first, "bäume" -> "bäumen" drifts to the
			// capitalised "Bäumen" and ends on the tree; without the second,
			// "gelaufen" (a verb participle) lands on the noun "Laufen", the sport.
			const target = await lookup(head.form_of, [head.lang], "", { pos: head.pos });
			if (target.length === 0) break;

			// The note comes from the form the reader actually tapped.
			lemma ??= { from: head.word, note: head.gloss };
			rows = target;
		}

		const body: DictionaryLookupResponse = {
			query: wordKey,
			requested,
			chain,
			entry: mapDictEntry(rows),
			lemma,
			attribution: DICT_ATTRIBUTION,
		};

		// Only changes when an import runs.
		c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
		return c.json(body);
	})
	.get("/languages", async (c) => {
		const counts = await getDictCounts();

		c.header("Cache-Control", "public, max-age=3600");
		return c.json({
			languages: DICT_LANGUAGES.map((l) => ({
				code: l.code,
				label: l.label,
				entries: counts[l.code] ?? 0,
			})),
			attribution: DICT_ATTRIBUTION,
		});
	});
