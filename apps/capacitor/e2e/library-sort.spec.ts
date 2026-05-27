import { expect, test } from "@playwright/test";
import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { importEpubViaFilePicker, resetStorage } from "./helpers/seed";

async function seedTwoBooks(page: import("@playwright/test").Page) {
	const apple = await buildEpubBuffer({
		title: "Apple Book",
		chapters: [{ id: "c1", href: "c1.htm", body: "<p>Apple content</p>" }],
	});
	const zebra = await buildEpubBuffer({
		title: "Zebra Book",
		chapters: [{ id: "c1", href: "c1.htm", body: "<p>Zebra content</p>" }],
	});
	await resetStorage(page);
	await importEpubViaFilePicker(page, { buffer: apple, fileName: "apple.epub", title: "Apple Book" });
	await importEpubViaFilePicker(page, { buffer: zebra, fileName: "zebra.epub", title: "Zebra Book" });
}

async function cardTitlesInOrder(page: import("@playwright/test").Page): Promise<string[]> {
	return page.locator('[data-testid="library-card"]').evaluateAll((nodes) =>
		nodes.map((n) => (n as HTMLElement).dataset.bookTitle ?? ""),
	);
}

test("library sort switches between recent (newest first) and title (A→Z)", async ({ page }) => {
	await seedTwoBooks(page);

	// Default sort is "recent"; Zebra was imported second so it sits first.
	expect(await cardTitlesInOrder(page)).toEqual(["Zebra Book", "Apple Book"]);

	// Switch to title sort.
	await page.getByRole("button", { name: "Sort" }).click();
	await page.getByRole("button", { name: "Title", exact: true }).click();
	await page.keyboard.press("Escape");

	expect(await cardTitlesInOrder(page)).toEqual(["Apple Book", "Zebra Book"]);
});
