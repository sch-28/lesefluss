import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance" },
	{ title: "Northlight", creator: "Ada Vance" },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

async function seedBooks(page: Page) {
	const dir = await mkdtemp(join(tmpdir(), "lesefluss-filter-"));
	for (const { title, creator } of BOOKS) {
		const buffer = await buildEpubBuffer({
			title,
			creator,
			chapters: [{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Body text.</p>" }],
		});
		await writeFile(join(dir, `${title.toLowerCase()}.epub`), buffer);
	}
	await page.goto("/tabs/library");
	await page.getByRole("button", { name: "Add book" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import multiple files" }).click();
	await (await chooserPromise).setFiles(dir);
	await page.getByRole("button", { name: `Import ${BOOKS.length} books` }).click({
		timeout: 20_000,
	});
	await expect(page.getByText(`Added ${BOOKS.length} books`)).toBeVisible({ timeout: 30_000 });
	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.locator("[data-book-title]")).toHaveCount(BOOKS.length);
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedBooks(page);
});

test("a value cycles through include, exclude and off, and the filter survives navigation", async ({
	page,
}) => {
	const bar = page.getByTestId("filter-bar");
	const picker = page.getByTestId("filter-picker");
	const cards = page.locator("[data-book-title]");

	await bar.getByRole("button", { name: "Add filter" }).click();
	await picker.getByRole("button", { name: "Author", exact: false }).first().click();

	await picker.getByRole("button", { name: "Author Ada Vance, off" }).click();
	await expect(cards).toHaveCount(2);
	await expect(bar.getByRole("button", { name: /^Remove filter/ })).toHaveCount(1);

	await picker.getByRole("button", { name: "Author Ada Vance, included" }).click();
	await expect(cards).toHaveCount(1);
	await expect(page.locator('[data-book-title="Riverkeep"]')).toBeVisible();
	await expect(bar.locator("[data-excluded]")).toHaveCount(1);

	await page.keyboard.press("Escape");
	await page.goto("/tabs/settings");
	await page.goto("/tabs/library");
	await expect(cards).toHaveCount(1);
	await expect(
		bar.getByRole("button", { name: "Remove filter − Author: Ada Vance" }),
	).toBeVisible();

	await bar.getByRole("button", { name: "Add filter" }).click();
	await picker.getByRole("button", { name: "Author Ada Vance, excluded" }).click();
	await expect(cards).toHaveCount(BOOKS.length);
	await expect(bar.getByRole("button", { name: /^Remove filter/ })).toHaveCount(0);
});

test("a chip's X removes its value and Clear removes them all", async ({ page }) => {
	const bar = page.getByTestId("filter-bar");
	const picker = page.getByTestId("filter-picker");
	const cards = page.locator("[data-book-title]");

	await bar.getByRole("button", { name: "Add filter" }).click();
	await picker.getByRole("button", { name: "Author", exact: false }).first().click();
	await picker.getByRole("button", { name: "Author Ada Vance, off" }).click();
	await picker.getByRole("button", { name: "Author Bo Lind, off" }).click();
	await page.keyboard.press("Escape");
	await expect(cards).toHaveCount(BOOKS.length);
	await expect(bar.getByRole("button", { name: /^Remove filter/ })).toHaveCount(2);

	await bar.getByRole("button", { name: "Remove filter Author: Bo Lind" }).click();
	await expect(bar.getByRole("button", { name: /^Remove filter/ })).toHaveCount(1);
	await expect(cards).toHaveCount(2);

	await bar.getByRole("button", { name: "Clear", exact: true }).click();
	await expect(bar.getByRole("button", { name: /^Remove filter/ })).toHaveCount(0);
	await expect(cards).toHaveCount(BOOKS.length);
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("the header's Filter opens the sheet, which counts the matches and clears", async ({
		page,
	}) => {
		const sheet = page.getByTestId("filter-picker");
		const cards = page.locator("[data-book-title]");

		await page.getByRole("button", { name: "Filter", exact: true }).click();
		await expect(sheet).toBeVisible();
		await sheet.getByRole("button", { name: "Author", exact: false }).first().click();
		await sheet.getByRole("button", { name: "Author Bo Lind, off" }).click();
		await expect(sheet.getByRole("button", { name: "Show 1 book" })).toBeVisible();
		await sheet.getByRole("button", { name: "Show 1 book" }).click();
		await expect(sheet).toBeHidden();
		await expect(cards).toHaveCount(1);

		await page.getByRole("button", { name: "Filter, 1 active" }).click();
		await sheet.getByRole("button", { name: "Clear" }).click();
		await expect(sheet.getByRole("button", { name: `Show ${BOOKS.length} books` })).toBeVisible();
		await sheet.getByRole("button", { name: `Show ${BOOKS.length} books` }).click();
		await expect(cards).toHaveCount(BOOKS.length);
	});
});
