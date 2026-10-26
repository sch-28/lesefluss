import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";

export const PLAIN_BOOK_TITLE = "Plain Text";

/**
 * Text only, 4,800 words in three page-mode chunks. Figures force column
 * breaks, and the slack they leave absorbs a reflow, so on the big book a
 * stale page index can show the right word by luck.
 */
export function plainBookFixture(): EpubFixture {
	const words = (n: number) => Array.from({ length: 80 }, (_, i) => `w${n}x${i}`).join(" ");
	const body = Array.from({ length: 60 }, (_, n) => `<p>${words(n)}</p>`).join("");
	return {
		title: PLAIN_BOOK_TITLE,
		chapters: [{ id: "c1", href: "c1.htm", body }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}
