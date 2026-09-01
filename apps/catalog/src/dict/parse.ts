import type { NewDictEntry } from "../db/schema.js";
import { normalizeWord } from "./normalize.js";

/**
 * One JSONL line from a kaikki dump -> the rows we keep.
 *
 * Both editions share this shape; everything not listed here (forms, sounds,
 * categories, etymology_texts, translations, head_templates) is dropped, which
 * is where the ~20x size reduction comes from.
 */
type KaikkiSense = {
	glosses?: unknown;
	form_of?: unknown;
	examples?: unknown;
};

type KaikkiEntry = {
	word?: unknown;
	pos?: unknown;
	lang_code?: unknown;
	senses?: unknown;
};

/**
 * Parts of speech that are never what a reader tapped a word for. Dropping them
 * is why looking up "ran" no longer answers "ISO 639-3 language code for
 * Riantana" — that sense is filed under `symbol`.
 */
const DROP_POS = new Set([
	"character",
	"symbol",
	"punct",
	"romanization",
	"syllable",
	"han character",
	"hanja",
	"kanji",
]);

/** Lower sorts first. Anything unlisted (including "unknown") falls to the end. */
const POS_RANK: Record<string, number> = {
	noun: 0,
	verb: 0,
	adj: 0,
	adv: 0,
	name: 1,
	phrase: 1,
	proverb: 1,
	prefix: 2,
	suffix: 2,
	particle: 2,
	conj: 2,
	prep: 2,
	pron: 2,
	num: 2,
	intj: 2,
	abbrev: 3,
	contraction: 3,
};
const POS_RANK_DEFAULT = 4;

const MAX_SENSES_PER_ENTRY = 6;
const MAX_GLOSS_LENGTH = 400;
const MAX_EXAMPLE_LENGTH = 300;

export type ParseStats = {
	kept: number;
	skippedMalformed: number;
	skippedLang: number;
	skippedPos: number;
	truncatedSenses: number;
};

export function emptyParseStats(): ParseStats {
	return { kept: 0, skippedMalformed: 0, skippedLang: 0, skippedPos: 0, truncatedSenses: 0 };
}

function firstString(value: unknown): string | null {
	if (!Array.isArray(value)) return null;
	const first = value[0];
	return typeof first === "string" && first.trim() ? first.trim() : null;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * `entryIndex` distinguishes homographs: the dump lists them as separate lines
 * for the same word and language, and they would otherwise collide on the
 * primary key. The caller tracks it per (lang, wordKey).
 */
export function parseLine(
	line: string,
	lang: string,
	entryIndex: number,
	stats: ParseStats,
): NewDictEntry[] {
	let entry: KaikkiEntry;
	try {
		entry = JSON.parse(line) as KaikkiEntry;
	} catch {
		// One bad byte in 1.6M lines must not abort a ten-minute import.
		stats.skippedMalformed++;
		return [];
	}

	// The German edition also carries entries *about* other languages.
	if (entry.lang_code !== lang) {
		stats.skippedLang++;
		return [];
	}

	const word = typeof entry.word === "string" ? entry.word.trim() : "";
	const wordKey = normalizeWord(word);
	if (!word || !wordKey) return [];

	const pos = typeof entry.pos === "string" ? entry.pos.toLowerCase() : "";
	if (!pos) return [];
	if (DROP_POS.has(pos)) {
		stats.skippedPos++;
		return [];
	}
	const posRank = POS_RANK[pos] ?? POS_RANK_DEFAULT;

	const senses = Array.isArray(entry.senses) ? entry.senses : [];
	const rows: NewDictEntry[] = [];
	const seenGlosses = new Set<string>();

	for (const raw of senses) {
		if (rows.length >= MAX_SENSES_PER_ENTRY) {
			stats.truncatedSenses++;
			break;
		}
		const sense = raw as KaikkiSense;
		const gloss = firstString(sense.glosses);
		if (!gloss || seenGlosses.has(gloss)) continue;
		seenGlosses.add(gloss);

		const lemma = formOfWord(sense.form_of);
		const lemmaKey = lemma ? normalizeWord(lemma) : null;

		rows.push({
			lang,
			wordKey,
			word,
			entryIndex,
			pos,
			posRank,
			senseIndex: rows.length,
			gloss: truncate(gloss, MAX_GLOSS_LENGTH),
			example: exampleText(sense.examples),
			// A pointer back to the same word would cost a second query for nothing.
			formOf: lemmaKey && lemmaKey !== wordKey ? lemmaKey : null,
		});
	}

	if (rows.length) stats.kept++;
	return rows;
}

/** `form_of` is `[{word: "Spruch"}]`, not a bare string array. */
function formOfWord(value: unknown): string | null {
	if (!Array.isArray(value)) return null;
	const first = value[0] as { word?: unknown } | undefined;
	return first && typeof first.word === "string" && first.word.trim() ? first.word.trim() : null;
}

function exampleText(value: unknown): string | null {
	if (!Array.isArray(value)) return null;
	for (const item of value) {
		const text = (item as { text?: unknown })?.text;
		if (typeof text === "string" && text.trim()) return truncate(text.trim(), MAX_EXAMPLE_LENGTH);
	}
	return null;
}
