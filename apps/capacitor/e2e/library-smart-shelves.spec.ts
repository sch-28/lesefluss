import { expect, type Page, test } from "@playwright/test";
import { openFilterPicker, seedLibrary } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance" },
	{ title: "Northlight", creator: "Ada Vance" },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.use({ viewport: { width: 1400, height: 900 } });

async function filterByAuthor(page: Page, author: string) {
	await openFilterPicker(page);
	const picker = page.getByTestId("filter-picker");
	await picker.getByRole("button", { name: "Author", exact: false }).first().click();
	await picker.getByRole("button", { name: `Author ${author}, off` }).click();
	await page.keyboard.press("Escape");
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
});

test("the shelf + starts from the current filter and saves a shelf that counts and reopens its books", async ({
	page,
}) => {
	const shelves = page.getByRole("region", { name: "Smart shelves" });
	const cards = page.locator("[data-book-title]");

	await filterByAuthor(page, "Ada Vance");
	await expect(cards).toHaveCount(2);

	await shelves.getByRole("button", { name: "New smart shelf" }).click();
	// A page, like New collection: it starts from the filter as it stood.
	await expect(page.getByRole("heading", { name: "New smart shelf" })).toBeVisible();
	await expect(page.getByTestId("shelf-live-count")).toHaveText("2 books match");
	await page.getByRole("textbox", { name: "Shelf name" }).fill("Ada");
	await page.getByRole("button", { name: "Create shelf" }).click();
	await expect(page.getByRole("heading", { name: "New smart shelf" })).toBeHidden();
	await expect(shelves.getByRole("link", { name: /^Ada .*2$/ })).toBeVisible();

	await page.getByTestId("filter-bar").getByRole("button", { name: "Clear", exact: true }).click();
	await expect(cards).toHaveCount(BOOKS.length);

	await shelves.getByRole("link", { name: /^Ada .*2$/ }).click();
	await expect(cards).toHaveCount(2);
	await expect(page.locator('[data-book-title="Riverkeep"]')).toHaveCount(0);
});

test("a shelf's count follows the library live", async ({ page }) => {
	const shelves = page.getByRole("region", { name: "Smart shelves" });
	await filterByAuthor(page, "Bo Lind");
	await shelves.getByRole("button", { name: "New smart shelf" }).click();
	await page.getByRole("textbox", { name: "Shelf name" }).fill("Bo");
	await page.getByRole("button", { name: "Create shelf" }).click();
	await expect(shelves.getByRole("link", { name: /^Bo .*1$/ })).toBeVisible();

	await page.locator('[data-book-title="Riverkeep"]').click({ button: "right" });
	await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
	await expect(shelves.getByRole("link", { name: /^Bo .*0$/ })).toBeVisible();
});
