/**
 * Word tokenizer mirroring the rsvpnano firmware
 * (apps/rsvpnano/src/storage/StorageManager.cpp::appendTokenizedLineWords +
 * appendDisplayApproximation).
 *
 * We mirror the firmware's effective tokenization, not its Latin8 byte layer:
 * per codepoint, what ASCII/Latin-1 replacement the device emits, and which
 * boundary / hyphen / ellipsis rule applies to the normalized stream.
 *
 * Codepoints the device cannot represent (CJK, Cyrillic, Greek, emoji, …) get
 * dropped on both sides so the word stream stays aligned over BLE position
 * sync.
 */

import type { WordEntry } from "./engine";
import { utf8ByteLengthOfCodePoint } from "./utf8";

/** Single dispatch table for every non-ASCII codepoint we recognize. */
const CP_FOLD = buildFoldTable();

function buildFoldTable(): Map<number, string> {
	const m = new Map<number, string>();

	const setMany = (cps: readonly number[], value: string) => {
		for (const cp of cps) m.set(cp, value);
	};

	// Drops: soft hyphen + zero-width + BOM.
	setMany([0x00ad, 0xfeff], "");
	for (let cp = 0x200b; cp <= 0x200f; cp++) m.set(cp, "");

	// Unicode whitespace → single space (boundary).
	setMany([0x00a0, 0x1680, 0x180e, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000], " ");
	for (let cp = 0x2000; cp <= 0x200a; cp++) m.set(cp, " ");

	// Smart quotes.
	setMany([0x2018, 0x2019, 0x201a, 0x201b, 0x2032, 0x2035, 0x2039, 0x203a], "'");
	setMany(
		[0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0x2036, 0x300c, 0x300d, 0x300e, 0x300f],
		'"',
	);

	// Hyphen variants.
	setMany([0x2010, 0x2011, 0x2212], "-");
	// Spaced dashes (em/en/horiz-bar/figure-dash/hyphen-bullet): turn into ` - `
	// so the tokenizer emits a standalone hyphen between surrounding words.
	setMany([0x2012, 0x2013, 0x2014, 0x2015, 0x2043], " - ");

	// Ellipsis.
	m.set(0x2026, "...");

	// Brackets / parens / braces / angles.
	setMany([0x207d, 0x208d, 0x2768, 0x276a, 0xff08], "(");
	setMany([0x207e, 0x208e, 0x2769, 0x276b, 0xff09], ")");
	setMany([0x2045, 0x2308, 0x230a, 0x3010, 0x3014, 0x3016, 0x3018, 0x301a, 0xff3b], "[");
	setMany([0x2046, 0x2309, 0x230b, 0x3011, 0x3015, 0x3017, 0x3019, 0x301b, 0xff3d], "]");
	setMany([0x2774, 0x2776, 0xff5b], "{");
	setMany([0x2775, 0x2777, 0xff5d], "}");
	setMany([0x2329, 0x27e8, 0x3008, 0x300a], "<");
	setMany([0x232a, 0x27e9, 0x3009, 0x300b], ">");

	// Bullets.
	setMany([0x2022, 0x2219, 0x00b7], "*");

	// Latin-1 supplement punctuation / symbols.
	const latin1Folds: Record<number, string> = {
		0x00a1: "!",
		0x00a2: "c",
		0x00a3: "GBP",
		0x00a4: "$",
		0x00a5: "Y",
		0x00a6: "|",
		0x00a7: "S",
		0x00a8: '"',
		0x00a9: "(c)",
		0x00aa: "a",
		0x00ab: '"',
		0x00ac: "!",
		0x00ae: "(r)",
		0x00af: "-",
		0x00b0: "deg",
		0x00b1: "+/-",
		0x00b2: "2",
		0x00b3: "3",
		0x00b4: "'",
		0x00b5: "u",
		0x00b6: "P",
		0x00b8: ",",
		0x00b9: "1",
		0x00ba: "o",
		0x00bb: '"',
		0x00bc: "1/4",
		0x00bd: "1/2",
		0x00be: "3/4",
		0x00bf: "?",
		0x00d7: "x",
		0x00f7: "/",
		0x2122: "TM",
	};
	for (const [cp, v] of Object.entries(latin1Folds)) m.set(Number(cp), v);

	// Latin Extended-A folds (mirrors firmware appendDisplayApproximation).
	const extA: Record<number, string> = {
		0x0100: "A", 0x0102: "A", 0x0101: "a", 0x0103: "a",
		0x0108: "C", 0x010a: "C", 0x010c: "C", 0x0109: "c", 0x010b: "c", 0x010d: "c",
		0x010e: "D", 0x0110: "D", 0x010f: "d", 0x0111: "d",
		0x0112: "E", 0x0114: "E", 0x0116: "E", 0x011a: "E",
		0x0113: "e", 0x0115: "e", 0x0117: "e", 0x011b: "e",
		0x011c: "G", 0x011e: "G", 0x0120: "G", 0x0122: "G",
		0x011d: "g", 0x011f: "g", 0x0121: "g", 0x0123: "g",
		0x0124: "H", 0x0126: "H", 0x0125: "h", 0x0127: "h",
		0x0128: "I", 0x012a: "I", 0x012c: "I", 0x012e: "I", 0x0130: "I",
		0x0129: "i", 0x012b: "i", 0x012d: "i", 0x012f: "i", 0x0131: "i",
		0x0134: "J", 0x0135: "j",
		0x0136: "K", 0x0137: "k",
		0x0139: "L", 0x013b: "L", 0x013d: "L", 0x013f: "L",
		0x013a: "l", 0x013c: "l", 0x013e: "l", 0x0140: "l",
		0x0141: "L", 0x0142: "l",
		0x0145: "N", 0x0147: "N", 0x0146: "n", 0x0148: "n",
		0x014c: "O", 0x014e: "O", 0x0150: "O",
		0x014d: "o", 0x014f: "o", 0x0151: "o",
		0x0152: "OE", 0x0153: "oe",
		0x0154: "R", 0x0156: "R", 0x0158: "R",
		0x0155: "r", 0x0157: "r", 0x0159: "r",
		0x015c: "S", 0x015e: "S", 0x0160: "S",
		0x015d: "s", 0x015f: "s", 0x0161: "s",
		0x0162: "T", 0x0164: "T", 0x0166: "T",
		0x0163: "t", 0x0165: "t", 0x0167: "t",
		0x0168: "U", 0x016a: "U", 0x016c: "U", 0x016e: "U", 0x0170: "U", 0x0172: "U",
		0x0169: "u", 0x016b: "u", 0x016d: "u", 0x016f: "u", 0x0171: "u", 0x0173: "u",
		0x0174: "W", 0x0175: "w",
		0x0176: "Y", 0x0178: "Y", 0x0177: "y",
		0x017d: "Z", 0x017e: "z",
		0x01e2: "AE", 0x01fc: "AE", 0x01e3: "ae", 0x01fd: "ae",
	};
	for (const [cp, v] of Object.entries(extA)) m.set(Number(cp), v);

	// Ligatures.
	const ligatures: Record<number, string> = {
		0xfb00: "ff", 0xfb01: "fi", 0xfb02: "fl",
		0xfb03: "ffi", 0xfb04: "ffl", 0xfb05: "st", 0xfb06: "st",
	};
	for (const [cp, v] of Object.entries(ligatures)) m.set(Number(cp), v);

	// Fullwidth punctuation.
	const fullwidthPunct: Record<number, string> = {
		0xff0c: ",", 0xff0e: ".", 0xff1a: ":", 0xff1b: ";", 0xff01: "!", 0xff1f: "?",
	};
	for (const [cp, v] of Object.entries(fullwidthPunct)) m.set(Number(cp), v);

	return m;
}

function isLatin1Letter(cp: number): boolean {
	if (cp < 0xc0 || cp > 0xff) return false;
	return cp !== 0xd7 && cp !== 0xf7;
}

/**
 * Returns the normalized replacement string for a codepoint.
 * Empty string = drop (unmappable codepoint or explicit-drop char).
 */
export function approximate(cp: number): string {
	// Hot path: ASCII printable.
	if (cp >= 0x20 && cp <= 0x7e) return String.fromCharCode(cp);

	// ASCII whitespace controls. Pass through so the state machine sees
	// boundaries and can count newlines for breakBefore.
	if (cp === 0x09 || cp === 0x0a || cp === 0x0b || cp === 0x0c || cp === 0x0d) {
		return String.fromCharCode(cp);
	}

	const folded = CP_FOLD.get(cp);
	if (folded !== undefined) return folded;

	// Latin-1 supplement letters: kept verbatim as single chars.
	if (isLatin1Letter(cp)) return String.fromCharCode(cp);

	// Fullwidth ASCII range fallback (those not explicit in the table).
	if (cp >= 0xff01 && cp <= 0xff5e) return String.fromCharCode(cp - 0xfee0);

	return "";
}

// ─── Char classification on the normalized stream ───────────────────────────

function isAsciiLetter(c: string): boolean {
	const v = c.charCodeAt(0);
	return (v >= 0x41 && v <= 0x5a) || (v >= 0x61 && v <= 0x7a);
}

function isAsciiDigit(c: string): boolean {
	const v = c.charCodeAt(0);
	return v >= 0x30 && v <= 0x39;
}

function isWordChar(c: string): boolean {
	if (isAsciiLetter(c)) return true;
	if (isAsciiDigit(c)) return true;
	return isLatin1Letter(c.charCodeAt(0));
}

function isEllipsisToken(token: string): boolean {
	if (token.length < 3) return false;
	for (let i = 0; i < token.length; i++) if (token[i] !== ".") return false;
	return true;
}

function isHyphenToken(token: string): boolean {
	if (token.length === 0) return false;
	for (let i = 0; i < token.length; i++) if (token[i] !== "-") return false;
	return true;
}

function hasReadableChar(token: string): boolean {
	for (let i = 0; i < token.length; i++) {
		if (isWordChar(token[i])) return true;
	}
	return false;
}

// ─── Tokenize ───────────────────────────────────────────────────────────────

/**
 * Tokenize content into a word stream matching the rsvpnano device.
 * Each entry's `byteOffset` is the UTF-8 byte offset of the source codepoint
 * that produced the word's first character.
 */
export function buildWordIndexFromTokenizer(content: string): WordEntry[] {
	// Phase 1: normalize source into a parallel (string, srcBytes) pair.
	// Single allocation each, no per-char object overhead.
	let normalized = "";
	const srcBytes: number[] = [];

	let srcByte = 0;
	for (let i = 0; i < content.length; ) {
		const cp = content.codePointAt(i) ?? 0;
		const cpStep = cp >= 0x10000 ? 2 : 1;
		const cpBytes = utf8ByteLengthOfCodePoint(cp);
		const startByte = srcByte;
		srcByte += cpBytes;
		i += cpStep;

		const replacement = approximate(cp);
		if (replacement.length === 0) continue;
		normalized += replacement;
		for (let k = 0; k < replacement.length; k++) srcBytes.push(startByte);
	}

	// Phase 2: tokenize normalized stream.
	const entries: WordEntry[] = [];

	let pendingToken: string | null = null;
	let pendingTokenByte = 0;
	let pendingTokenBreakBefore = false;

	let currentWord = "";
	let currentWordByte = 0;
	let currentWordBreakBefore = false;

	let pendingBreakBefore = false;
	let newlineRun = 0;

	const flushPending = () => {
		if (pendingToken === null) return;
		const entry: WordEntry = { word: pendingToken, byteOffset: pendingTokenByte };
		if (pendingTokenBreakBefore && entries.length > 0) entry.breakBefore = true;
		entries.push(entry);
		pendingToken = null;
		pendingTokenBreakBefore = false;
	};

	const finishToken = (rawToken: string, byteOffset: number, breakBefore: boolean) => {
		if (rawToken.length === 0) return;
		// rawToken is already whitespace-free (chars only accumulate non-boundary).
		if (isEllipsisToken(rawToken)) {
			if (pendingToken !== null) pendingToken += "...";
			return;
		}
		if (isHyphenToken(rawToken)) {
			flushPending();
			pendingToken = "-";
			pendingTokenByte = byteOffset;
			pendingTokenBreakBefore = breakBefore;
			return;
		}
		if (!hasReadableChar(rawToken)) return;
		flushPending();
		pendingToken = rawToken;
		pendingTokenByte = byteOffset;
		pendingTokenBreakBefore = breakBefore;
	};

	const flushCurrent = () => {
		if (currentWord.length === 0) return;
		finishToken(currentWord, currentWordByte, currentWordBreakBefore);
		currentWord = "";
	};

	const n = normalized.length;
	for (let i = 0; i < n; i++) {
		const c = normalized[i];
		const code = c.charCodeAt(0);

		if (c === "\n") {
			newlineRun++;
			if (newlineRun >= 2) pendingBreakBefore = true;
			flushCurrent();
			continue;
		}

		if (code <= 0x20) {
			newlineRun = 0;
			flushCurrent();
			continue;
		}
		newlineRun = 0;

		if (c === "-") {
			const prevReadable =
				currentWord.length > 0 && isWordChar(currentWord[currentWord.length - 1]);
			const next = i + 1 < n ? normalized[i + 1] : "";
			const inline = prevReadable && next !== "" && next !== "-" && isWordChar(next);
			if (inline) {
				currentWord += c;
				continue;
			}
			flushCurrent();
			let j = i;
			while (j + 1 < n && normalized[j + 1] === "-") j++;
			finishToken("-", srcBytes[i], pendingBreakBefore);
			pendingBreakBefore = false;
			i = j;
			continue;
		}

		if (c === "." && i + 2 < n && normalized[i + 1] === "." && normalized[i + 2] === ".") {
			currentWord += "...";
			i += 2;
			while (i + 1 < n && normalized[i + 1] === ".") i++;
			flushCurrent();
			continue;
		}

		if (currentWord.length === 0) {
			currentWordByte = srcBytes[i];
			currentWordBreakBefore = pendingBreakBefore;
			pendingBreakBefore = false;
		}
		currentWord += c;
	}

	flushCurrent();
	flushPending();

	return entries;
}
