import { expect, type Page, test } from "@playwright/test";
import { seedLibrary } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance" },
	{ title: "Northlight", creator: "Ada Vance" },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.use({ viewport: { width: 1400, height: 900 } });

async function filterByAuthor(page: Page, author: string) {
	await page.getByTestId("filter-bar").getByRole("button", { name: "Add filter" }).click();
	const picker = page.getByTestId("filter-picker");
	await picker.getByRole("button", { name: "Author", exact: false }).first().click();
	await picker.getByRole("button", { name: `Author ${author}, off` }).click();
	await page.keyboard.press("Escape");
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
});

test("the current filter saves as a shelf that counts and reopens its books", async ({ page }) => {
	const shelves = page.getByRole("region", { name: "Smart shelves" });
	const cards = page.locator("[data-book-title]");

	await expect(shelves.getByRole("button", { name: "Save current filter…" })).toBeDisabled();
	await filterByAuthor(page, "Ada Vance");
	await expect(cards).toHaveCount(2);

	await shelves.getByRole("button", { name: "Save current filter…" }).click();
	const dialog = page.getByRole("dialog", { name: "Save as smart shelf" });
	await expect(dialog.getByTestId("shelf-live-count")).toHaveText("2 books match right now");
	await dialog.getByRole("textbox", { name: "Shelf name" }).fill("Ada");
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(dialog).toBeHidden();
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
	await shelves.getByRole("button", { name: "Save current filter…" }).click();
	const dialog = page.getByRole("dialog", { name: "Save as smart shelf" });
	await dialog.getByRole("textbox", { name: "Shelf name" }).fill("Bo");
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(shelves.getByRole("link", { name: /^Bo .*1$/ })).toBeVisible();

	await page.locator('[data-book-title="Riverkeep"]').click({ button: "right" });
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
	await expect(shelves.getByRole("link", { name: /^Bo .*0$/ })).toBeVisible();
});
