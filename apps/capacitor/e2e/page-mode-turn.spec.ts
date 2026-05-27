import { expect, test } from "@playwright/test";
import {
	buildEpubBuffer,
	type EpubFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { reader } from "./page-objects/reader";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";

/** Many-paragraph fixture so page-mode definitely paginates into >1 page. */
function bigBookFixture(): EpubFixture {
	const paragraphs: string[] = [];
	for (let i = 1; i <= 60; i++) {
		paragraphs.push(
			`<p class="indent">Paragraph ${i} contains enough text to push the page boundary forward by a noticeable amount, ensuring that page-mode pagination splits the body across at least two pages even on a tall viewport.</p>`,
		);
	}
	const body = `<h1>1</h1><h1>BIG BOOK</h1>${paragraphs.join("")}`;
	return {
		title: "Big Book",
		chapters: [{ id: "c1", href: "c1.htm", body }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("page-mode next-page keyboard advances the first visible word", async ({ page }) => {
	const buffer = await buildEpubBuffer(bigBookFixture());
	await importEpubViaFilePicker(page, { buffer, fileName: "big.epub", title: "Big Book" });
	await openBookFromLibrary(page, "Big Book");

	await reader.setPaginationStyle(page, "page");

	// Page-view keeps every word in the DOM and shifts via CSS transforms, so
	// `data-word` of the first DOM span doesn't reveal the active page. Instead
	// observe the position save the page-view fires on chunk settle.
	// Focus the document body so the global key handler receives the keypress.
	await page.locator("body").click({ position: { x: 200, y: 400 } });
	const savePending = reader.waitForNextSave(page);
	await page.keyboard.press("ArrowRight");
	await savePending;

	const afterWord = await reader.lastSavedWord(page);
	expect(afterWord).toBeGreaterThan(0);
});
