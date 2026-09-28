import { expect, type Page, test } from "@playwright/test";
import { reader } from "../e2e/page-objects/reader";
import { importFixtureBook, openBook } from "./support/library";

async function select(page: Page) {
	await reader.selectWords(page, "opening", "paragraph");
	const toolbar = page.getByRole("toolbar");
	await expect(toolbar).toBeVisible();
	return toolbar;
}

test("Escape and a margin click dismiss the toolbar; a resize moves it with the selection", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	const title = await importFixtureBook(page);
	await openBook(page, title);

	const toolbar = await select(page);
	await page.keyboard.press("Escape");
	await expect(toolbar).toHaveCount(0);

	await select(page);
	const word = await reader.wordSpan(page, "opening").boundingBox();
	const view = await page.getByTestId("reader-view").boundingBox();
	if (!word || !view) throw new Error("Reader not laid out");
	await page.mouse.click(view.x + 3, word.y + word.height / 2);
	await expect(toolbar).toHaveCount(0);

	await select(page);
	const before = await toolbar.boundingBox();
	await page.setViewportSize({ width: 420, height: 800 });
	// The text column re-centres, so the selected words move left; the toolbar must follow them.
	await expect
		.poll(async () => {
			const bar = await toolbar.boundingBox();
			const start = await reader.wordSpan(page, "opening").boundingBox();
			if (!bar || !start) return "not laid out";
			if (bar.x < 0 || bar.x + bar.width > 420) return `outside the viewport at x=${bar.x}`;
			const gap = Math.min(Math.abs(bar.y + bar.height - start.y), Math.abs(bar.y - start.y));
			const overlaps = bar.x < start.x + start.width + 200 && bar.x + bar.width > start.x - 200;
			return overlaps && gap < 120 ? "follows the selection" : `x=${bar.x} y=${bar.y}`;
		})
		.toBe("follows the selection");
	expect((await toolbar.boundingBox())?.x).not.toBe(before?.x);
});
