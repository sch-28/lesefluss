import {
	type EpubFixture,
	LANDSCAPE_PNG_BASE64,
	PORTRAIT_PNG_BASE64,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import type { Page } from "@playwright/test";
import { reader } from "../page-objects/reader";
import { openBookFromLibrary, seedFixture } from "./seed";

export const BIG_BOOK_TITLE = "Big Book";

/** Paragraph numbers that a figure precedes; `FULL_PAGE_FIGURE_BEFORE` is the tall one. */
const FIGURE_BEFORE_PARAGRAPHS = [15, 30, 45];
export const FULL_PAGE_FIGURE_BEFORE = 30;

type BigBookOptions = {
	/** A page-sized figure before the first paragraph: the book opens on it. */
	leadingFigure?: boolean;
	/** A page-sized figure after the last paragraph. */
	trailingFigure?: boolean;
	/** Paragraphs of 32 words; the default 60 fits in one 2000-word page-mode chunk. */
	paragraphCount?: number;
};

const TALL_FIGURE = (alt: string) =>
	`<div class="figure"><img alt="${alt}" src="images/tall.png"/></div>`;

/** Many-paragraph fixture so page-mode definitely paginates into >1 page.
 *  Figures every 15 paragraphs, one of them tall enough to own a page. */
export function bigBookFixture(options: BigBookOptions = {}): EpubFixture {
	const paragraphs: string[] = [];
	if (options.leadingFigure) paragraphs.push(TALL_FIGURE("Frontispiece"));
	for (let i = 1; i <= (options.paragraphCount ?? 60); i++) {
		if (i === FULL_PAGE_FIGURE_BEFORE) paragraphs.push(TALL_FIGURE(`Figure ${i}`));
		else if (FIGURE_BEFORE_PARAGRAPHS.includes(i)) {
			paragraphs.push(`<div class="figure"><img alt="Figure ${i}" src="images/wide.png"/></div>`);
		}
		paragraphs.push(
			`<p class="indent">Paragraph ${i} contains enough text to push the page boundary forward by a noticeable amount, ensuring that page-mode pagination splits the body across at least two pages even on a tall viewport.</p>`,
		);
	}
	if (options.trailingFigure) paragraphs.push(TALL_FIGURE("Endpiece"));
	const body = `<h1>1</h1><h1>BIG BOOK</h1>${paragraphs.join("")}`;
	return {
		title: BIG_BOOK_TITLE,
		images: [
			{ href: "images/wide.png", base64: LANDSCAPE_PNG_BASE64, mediaType: "image/png" },
			{ href: "images/tall.png", base64: PORTRAIT_PNG_BASE64, mediaType: "image/png" },
		],
		chapters: [{ id: "c1", href: "c1.htm", body }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

/** Wipe storage and import the big-book fixture; returns its title. */
export async function seedBigBook(page: Page): Promise<string> {
	return seedFixture(page, bigBookFixture(), "big.epub");
}

/**
 * Wipe storage, import the big-book fixture, open it and switch the reader to
 * page mode. Callers that care about the paginated layout should set the
 * viewport BEFORE calling this, so the first pagination happens at that size.
 */
export async function openBigBookInPageMode(page: Page): Promise<void> {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.setPaginationStyle(page, "page");
}
