import {
	buildEpubBuffer,
	strayAnchorFixture,
	withoutImages,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, test } from "@playwright/test";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("imports an EPUB with stray page anchors and renders full chapter content", async ({
	page,
}) => {
	// The regression is about text; the images the shared fixture carries would
	// only push chapter 2 out of the virtual list's mounted window.
	const fixture = withoutImages(strayAnchorFixture());
	const buffer = await buildEpubBuffer(fixture);
	await importEpubViaFilePicker(page, {
		buffer,
		fileName: "stray-anchors.epub",
		title: fixture.title ?? "Stray Anchor Test",
	});

	await openBookFromLibrary(page, fixture.title ?? "");

	const reader = page.locator("body");
	for (const phrase of [
		"TITLE 1",
		"Chapter 1 opening paragraph anchors the scene.",
		"Chapter 1 second paragraph develops the moment with an embedded anchor.",
		"Chapter 1 third paragraph with leading anchor.",
		"Chapter 1 fourth paragraph continues here.",
		"Chapter 1 fifth paragraph also leads with an anchor.",
		"Chapter 1 sixth paragraph closes the chapter completely.",
		"TITLE 2",
		"Chapter 2 opening paragraph anchors the scene.",
		"Chapter 2 sixth paragraph closes the chapter completely.",
	]) {
		await expect(reader).toContainText(phrase, { timeout: 10_000 });
	}
});
