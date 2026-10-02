/**
 * Codepoint folding copied from packages/core/src/tokenizer.ts (`CP_FOLD` and
 * `approximate`). The catalog runs compiled JS and core ships TS source, so it
 * cannot be imported at runtime; `word-count.test.ts` runs both on the same
 * samples so a change on either side fails the build.
 */

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
	setMany([0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0x2036, 0x300c, 0x300d, 0x300e, 0x300f], '"');

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
		161: "!",
		162: "c",
		163: "GBP",
		164: "$",
		165: "Y",
		166: "|",
		167: "S",
		168: '"',
		169: "(c)",
		170: "a",
		171: '"',
		172: "!",
		174: "(r)",
		175: "-",
		176: "deg",
		177: "+/-",
		178: "2",
		179: "3",
		180: "'",
		181: "u",
		182: "P",
		184: ",",
		185: "1",
		186: "o",
		187: '"',
		188: "1/4",
		189: "1/2",
		190: "3/4",
		191: "?",
		215: "x",
		247: "/",
		8482: "TM",
	};
	for (const [cp, v] of Object.entries(latin1Folds)) m.set(Number(cp), v);

	// Latin Extended-A folds (mirrors firmware appendDisplayApproximation).
	const extA: Record<number, string> = {
		256: "A",
		258: "A",
		257: "a",
		259: "a",
		264: "C",
		266: "C",
		268: "C",
		265: "c",
		267: "c",
		269: "c",
		270: "D",
		272: "D",
		271: "d",
		273: "d",
		274: "E",
		276: "E",
		278: "E",
		282: "E",
		275: "e",
		277: "e",
		279: "e",
		283: "e",
		284: "G",
		286: "G",
		288: "G",
		290: "G",
		285: "g",
		287: "g",
		289: "g",
		291: "g",
		292: "H",
		294: "H",
		293: "h",
		295: "h",
		296: "I",
		298: "I",
		300: "I",
		302: "I",
		304: "I",
		297: "i",
		299: "i",
		301: "i",
		303: "i",
		305: "i",
		308: "J",
		309: "j",
		310: "K",
		311: "k",
		313: "L",
		315: "L",
		317: "L",
		319: "L",
		314: "l",
		316: "l",
		318: "l",
		320: "l",
		321: "L",
		322: "l",
		325: "N",
		327: "N",
		326: "n",
		328: "n",
		332: "O",
		334: "O",
		336: "O",
		333: "o",
		335: "o",
		337: "o",
		338: "OE",
		339: "oe",
		340: "R",
		342: "R",
		344: "R",
		341: "r",
		343: "r",
		345: "r",
		348: "S",
		350: "S",
		352: "S",
		349: "s",
		351: "s",
		353: "s",
		354: "T",
		356: "T",
		358: "T",
		355: "t",
		357: "t",
		359: "t",
		360: "U",
		362: "U",
		364: "U",
		366: "U",
		368: "U",
		370: "U",
		361: "u",
		363: "u",
		365: "u",
		367: "u",
		369: "u",
		371: "u",
		372: "W",
		373: "w",
		374: "Y",
		376: "Y",
		375: "y",
		381: "Z",
		382: "z",
		482: "AE",
		508: "AE",
		483: "ae",
		509: "ae",
	};
	for (const [cp, v] of Object.entries(extA)) m.set(Number(cp), v);

	// Ligatures.
	const ligatures: Record<number, string> = {
		64256: "ff",
		64257: "fi",
		64258: "fl",
		64259: "ffi",
		64260: "ffl",
		64261: "st",
		64262: "st",
	};
	for (const [cp, v] of Object.entries(ligatures)) m.set(Number(cp), v);

	// Fullwidth punctuation.
	const fullwidthPunct: Record<number, string> = {
		65292: ",",
		65294: ".",
		65306: ":",
		65307: ";",
		65281: "!",
		65311: "?",
	};
	for (const [cp, v] of Object.entries(fullwidthPunct)) m.set(Number(cp), v);

	return m;
}

export function isLatin1Letter(cp: number): boolean {
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
