import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";

export const NOVEL_TITLE = "Novel";
export const UNIFORM_NOVEL_TITLE = "Uniform Novel";
/** The TOC entry that starts near word 45k, deep enough for thousands of unmeasured paragraphs above. */
export const DEEP_CHAPTER_LABEL = "2: Deep";

const PARAGRAPH_COUNT = 2500;
const DEEP_CHAPTER_WORD = 45_000;

const SYLLABLES = ["ka", "lo", "mer", "ste", "in", "qua", "dra", "o", "bel", "nith", "wa", "ru"];

/** mulberry32: a fixed sequence for a fixed seed, so every run builds the same book. */
function prng(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A novel's paragraph length mix: mostly short, some long, a few very long. virtua
 * sizes unmeasured items at the median of the measured ones, so with mixed lengths
 * every paragraph that mounts above the viewport corrects the scroll offset, as in
 * a real book. Uniform paragraphs make that estimate exact and hide it.
 */
function paragraphLength(random: () => number): number {
	const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
	const roll = random();
	if (roll < 0.65) return between(8, 30);
	if (roll < 0.95) return between(80, 200);
	return between(400, 900);
}

function word(random: () => number): string {
	const syllables = 1 + Math.floor(random() * 3);
	let w = "";
	for (let i = 0; i < syllables; i++) w += SYLLABLES[Math.floor(random() * SYLLABLES.length)];
	return w;
}

/**
 * One long first chapter, then a second one from about word 45k: the importer
 * keeps no TOC fragment, so the deep entry needs its own chapter file.
 * `uniform` gives every paragraph the mix's mean length, as the control.
 */
export function novelFixture({ uniform = false, seed = 206 } = {}): EpubFixture {
	const random = prng(seed);
	const first: string[] = [];
	const second: string[] = [];
	let words = 0;
	for (let i = 0; i < PARAGRAPH_COUNT; i++) {
		const length = uniform ? 87 : paragraphLength(random);
		const text = Array.from({ length }, () => word(random)).join(" ");
		(words < DEEP_CHAPTER_WORD ? first : second).push(`<p>${text}.</p>`);
		words += length;
	}
	return {
		title: uniform ? UNIFORM_NOVEL_TITLE : NOVEL_TITLE,
		chapters: [
			{ id: "c1", href: "c1.htm", body: `<h1>Start</h1>${first.join("")}` },
			{ id: "c2", href: "c2.htm", body: `<h1>Deep</h1>${second.join("")}` },
		],
		navPoints: [
			{ label: "1: Start", href: "c1.htm" },
			{ label: DEEP_CHAPTER_LABEL, href: "c2.htm" },
		],
	};
}
