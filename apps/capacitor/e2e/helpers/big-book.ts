import { buildEpubBuffer, type EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import type { Page } from "@playwright/test";
import { reader } from "../page-objects/reader";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./seed";

export const BIG_BOOK_TITLE = "Big Book";

/** Many-paragraph fixture so page-mode definitely paginates into >1 page. */
export function bigBookFixture(): EpubFixture {
	const paragraphs: string[] = [];
	for (let i = 1; i <= 60; i++) {
		paragraphs.push(
			`<p class="indent">Paragraph ${i} contains enough text to push the page boundary forward by a noticeable amount, ensuring that page-mode pagination splits the body across at least two pages even on a tall viewport.</p>`,
		);
	}
	const body = `<h1>1</h1><h1>BIG BOOK</h1>${paragraphs.join("")}`;
	return {
		title: BIG_BOOK_TITLE,
		chapters: [{ id: "c1", href: "c1.htm", body }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

/**
 * Wipe storage, import the big-book fixture, open it and switch the reader to
 * page mode. Callers that care about the paginated layout should set the
 * viewport BEFORE calling this, so the first pagination happens at that size.
 */
export async function openBigBookInPageMode(page: Page): Promise<void> {
	await resetStorage(page);
	const buffer = await buildEpubBuffer(bigBookFixture());
	await importEpubViaFilePicker(page, {
		buffer,
		fileName: "big.epub",
		title: BIG_BOOK_TITLE,
	});
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.setPaginationStyle(page, "page");
}
