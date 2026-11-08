import { expect, test } from "@playwright/test";
import { openTable, seedLibrary, tableTitles, tagInTable } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance" },
	{ title: "Northlight", creator: "Cy Moor" },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.use({ viewport: { width: 1400, height: 900 } });

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
	await openTable(page);
});

test("a header sorts the rows and a second click reverses them", async ({ page }) => {
	await page.getByRole("button", { name: "Sort by Author" }).click();
	await expect.poll(() => tableTitles(page)).toEqual(["Tidewater", "Riverkeep", "Northlight"]);
	await page.getByRole("button", { name: "Author, sorted ascending" }).click();
	await expect.poll(() => tableTitles(page)).toEqual(["Northlight", "Riverkeep", "Tidewater"]);
});

test("Shift-click adds a second sort that breaks the first one's ties", async ({ page }) => {
	// Every book is unread, so the status sort ties them all.
	await page.getByRole("button", { name: "Sort by Status" }).click();
	await page.getByRole("button", { name: "Sort by Title" }).click({ modifiers: ["Shift"] });
	await expect(page.getByRole("button", { name: "Title, sorted ascending, sort 2" })).toBeVisible();
	await expect.poll(() => tableTitles(page)).toEqual(["Northlight", "Riverkeep", "Tidewater"]);

	await page
		.getByRole("button", { name: "Title, sorted ascending, sort 2" })
		.click({ modifiers: ["Shift"] });
	await expect.poll(() => tableTitles(page)).toEqual(["Tidewater", "Riverkeep", "Northlight"]);
	await expect(page.getByRole("button", { name: /^Status, sorted .*, sort 1$/ })).toBeVisible();
});

test("rating and status edit in place and feed the built-in shelves", async ({ page }) => {
	const shelves = page.getByRole("region", { name: "Smart shelves" });

	await page.getByRole("button", { name: "Edit status of Riverkeep" }).click();
	await page.getByRole("button", { name: "Finished", exact: true }).click();
	await expect(page.getByRole("button", { name: "Edit status of Riverkeep" })).toHaveText(
		"Finished",
	);
	// "Unrated" holds finished books without a rating.
	await expect(shelves.getByRole("link", { name: "Finished Pinned 1" })).toBeVisible();
	await expect(shelves.getByRole("link", { name: "Unrated Pinned 1" })).toBeVisible();

	await page.getByRole("button", { name: "Edit rating of Riverkeep" }).click();
	await page
		.getByRole("group", { name: "Rate Riverkeep" })
		.getByRole("button", { name: "Rate 4 stars" })
		.click();
	await expect(shelves.getByRole("link", { name: "Unrated Pinned 0" })).toBeVisible();

	// The table keeps the view across a reload: the edit is in the database, not the cell.
	await page.reload();
	await expect(page.getByRole("button", { name: "Edit status of Riverkeep" })).toHaveText(
		"Finished",
	);
});

test("a tag added in its cell filters like any other tag", async ({ page }) => {
	await tagInTable(page, "Tidewater", ["sea"]);
	await expect(page.getByRole("button", { name: "Edit tags of Tidewater" })).toHaveText("sea");

	await page.getByRole("button", { name: "Search library" }).click();
	await page.getByRole("combobox", { name: "Search library" }).fill("tag:sea ");
	await expect.poll(() => tableTitles(page)).toEqual(["Tidewater"]);
});
