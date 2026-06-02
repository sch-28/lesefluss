import { buildEpubBuffer, type EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, test } from "@playwright/test";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

async function importBook(page: import("@playwright/test").Page, fixture: EpubFixture) {
	await resetStorage(page);
	const buffer = await buildEpubBuffer(fixture);
	const title = fixture.title ?? "Test";
	await importEpubViaFilePicker(page, { buffer, fileName: "links.epub", title });
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
}

test("renders a captured hyperlink as .word-link and opens it on tap", async ({ page }) => {
	await importBook(page, {
		title: "Link Book",
		chapters: [
			{
				id: "c1",
				href: "c1.xhtml",
				title: "One",
				body: '<p>Read the <a href="https://example.com/docs">documentation</a> now.</p>',
			},
		],
	});

	const link = reader.wordSpan(page, "documentation");
	await expect(link).toBeVisible();
	await expect(link).toHaveClass(/word-link/);

	await link.click();
	await reader.waitForLinkOpen(page, "https://example.com/docs");
	expect(await reader.lastLinkOpened(page)).toBe("https://example.com/docs");
});

test("linkifies a bare URL in plain text and opens it on tap", async ({ page }) => {
	await importBook(page, {
		title: "Bare URL Book",
		chapters: [
			{
				id: "c1",
				href: "c1.xhtml",
				title: "One",
				body: "<p>Visit https://bare.example/page today.</p>",
			},
		],
	});

	const link = reader.wordSpan(page, "https://bare.example/page");
	await expect(link).toBeVisible();
	await expect(link).toHaveClass(/word-link/);

	await link.click();
	await reader.waitForLinkOpen(page, "https://bare.example/page");
});
