import {
	buildEpubBuffer,
	strayAnchorFixture,
	withoutImages,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture, stageEpubViaFilePicker } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * TASK-177.9. A book pulled from sync has its text but no original file and no
 * images. Importing that file again must offer to attach it to the existing
 * book instead of adding a copy, keeping the position and gaining the figures.
 * The image-free fixture variant stands in for the synced copy: same text,
 * nothing else.
 */

const ATTACH = "Attach";
const CHAPTER_2_OPENING = "Chapter 2 opening paragraph anchors the scene.";

/** The confirm sheet reports whether it is still deciding about an attach offer. */
async function waitForAttachLookup(page: Page): Promise<void> {
	await expect(page.locator("[data-alternative-state]")).not.toHaveAttribute(
		"data-alternative-state",
		"checking",
		{ timeout: 10_000 },
	);
}

test("re-importing the file of a text-only book attaches it: one copy, position kept, figures shown", async ({
	page,
}) => {
	const title = await seedFixture(page, withoutImages(strayAnchorFixture()), "plain.epub");

	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);
	await expect(page.locator(".reader-figure")).toHaveCount(0);
	const saved = reader.waitForNextSave(page);
	await reader.moveToChapter(page, "2: Second");
	await saved;
	const word = await reader.firstWordPositionIn(page.getByText(CHAPTER_2_OPENING));

	await stageEpubViaFilePicker(page, {
		buffer: await buildEpubBuffer(strayAnchorFixture()),
		fileName: "illustrated.epub",
	});
	await waitForAttachLookup(page);
	await expect(page.getByText(`Already in your library as "${title}"`)).toBeVisible();
	await page.getByRole("button", { name: ATTACH, exact: true }).click();
	await expect(page.getByText(`Attached to "${title}"`)).toBeVisible({ timeout: 10_000 });
	await expect(page.locator("[data-book-title]")).toHaveCount(1);

	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await expect(page.locator(`span[data-word="${word}"]`)).toBeInViewport();
	await expect(page.locator('.reader-figure img[alt="Chapter art 2"]')).toBeVisible({
		timeout: 10_000,
	});
});

test("a different book gets no attach offer and is added as usual", async ({ page }) => {
	const title = await seedFixture(page, strayAnchorFixture(), "stray.epub");

	await stageEpubViaFilePicker(page, {
		buffer: await buildEpubBuffer(bigBookFixture()),
		fileName: "big.epub",
	});
	await waitForAttachLookup(page);
	await expect(page.locator("[data-alternative-state]")).toHaveAttribute(
		"data-alternative-state",
		"none",
	);
	await page.getByRole("button", { name: "Add to library" }).click();
	await expect(page.locator(`[data-book-title="${title}"]`)).toHaveCount(1);
	await expect(page.locator("[data-book-title]")).toHaveCount(2, { timeout: 20_000 });
});
