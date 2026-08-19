import { expect, test } from "@playwright/test";
import { openBigBookInPageMode } from "./helpers/big-book";
import { reader } from "./page-objects/reader";

test("page-mode next-page keyboard advances the first visible word", async ({ page }) => {
	await openBigBookInPageMode(page);

	// Page-view keeps every word in the DOM and shifts via CSS transforms, so
	// `data-word` of the first DOM span doesn't reveal the active page. Instead
	// observe the position save the page-view fires on chunk settle.
	await reader.turnPages(page, 1);

	const afterWord = await reader.lastSavedWord(page);
	expect(afterWord).toBeGreaterThan(0);
});
