import { expect, type Page, test } from "@playwright/test";
import { bookCard, openTable, seedLibrary, tableTitles } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance", series: { name: "Tide", index: 2 } },
	{ title: "Northlight", creator: "Ada Vance", series: { name: "Tide", index: 1 } },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
});

/** Desktop: makes "Holiday" from Riverkeep and Tidewater and opens it from the sidebar. */
async function openHolidayCollection(page: Page) {
	const sidebar = page.getByRole("region", { name: "Collections" });
	await sidebar.getByRole("button", { name: "New collection" }).first().click();
	await expect(page).toHaveURL(/\/tabs\/library\/collections\/new/);

	await page.getByRole("textbox", { name: "Name" }).fill("Holiday");
	await page.getByRole("button", { name: "Riverkeep Bo Lind" }).click();
	await page.getByRole("button", { name: "Tidewater Ada Vance" }).click();
	await page.getByRole("button", { name: "Create with 2 books" }).click();

	// Every row keeps its book count and its options button.
	await expect(sidebar.getByRole("link", { name: "Holiday 2", exact: true })).toBeVisible();
	await expect(sidebar.getByRole("button", { name: "Holiday options" })).toBeVisible();
	await sidebar.getByRole("link", { name: "Holiday 2", exact: true }).click();
	await expect(page).toHaveURL(/collection=/);
	await expect(page.locator("[data-book-title]")).toHaveCount(2);
}

test.describe("on desktop", () => {
	test.use({ viewport: { width: 1400, height: 900 } });

	test("a new collection takes the picked books and opens from the sidebar", async ({ page }) => {
		await openHolidayCollection(page);
		await expect(bookCard(page, "Northlight")).toHaveCount(0);

		// The open collection lives in the URL, so it survives a reload.
		await page.reload();
		await expect(page.locator("[data-book-title]")).toHaveCount(2);
	});

	test("search, the table view and its sort work inside a collection", async ({ page }) => {
		await openHolidayCollection(page);

		const box = page.getByRole("combobox", { name: "Search library" });
		await page.getByRole("button", { name: "Search library" }).click();
		await box.fill("river");
		await expect(page.locator("[data-book-title]")).toHaveCount(1);
		await expect(bookCard(page, "Riverkeep")).toBeVisible();
		await box.fill("");
		await expect(page.locator("[data-book-title]")).toHaveCount(2);

		await openTable(page);
		await page.getByRole("button", { name: "Sort by Title" }).click();
		await expect.poll(() => tableTitles(page)).toEqual(["Riverkeep", "Tidewater"]);
		await page.getByRole("button", { name: "Title, sorted ascending" }).click();
		await expect.poll(() => tableTitles(page)).toEqual(["Tidewater", "Riverkeep"]);
		await expect(page).toHaveURL(/collection=/);
	});

	test("two books of one series form an ordered series collection", async ({ page }) => {
		const series = page.getByRole("region", { name: "Series" });
		await expect(series.getByRole("link", { name: "Tide 2" })).toBeVisible();
		await series.getByRole("link", { name: "Tide 2" }).click();

		await expect(page.getByRole("heading", { name: "Tide", level: 1 })).toBeVisible();
		const first = page.getByRole("button", { name: "Northlight", exact: true });
		const second = page.getByRole("button", { name: "Tidewater", exact: true });
		await expect(first).toBeVisible();
		await expect(second).toBeVisible();
		await expect(page.getByRole("button", { name: "Riverkeep", exact: true })).toHaveCount(0);
		const secondHandle = await second.elementHandle();
		expect(
			await first.evaluate(
				(a, b) => !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
				secondHandle,
			),
		).toBe(true);

		// The library's own cards carry the #N and the reorder menu.
		const badges = page.getByTestId("series-number-badge");
		await expect(badges).toHaveText(["#1", "#2"]);
		await page.getByRole("button", { name: "More for Tidewater" }).click();
		await page.getByRole("menuitem", { name: "Move up" }).click();
		await expect
			.poll(() =>
				page
					.locator("[data-book-title]")
					.evaluateAll((els) => els.map((e) => e.getAttribute("data-book-title"))),
			)
			.toEqual(["Tidewater", "Northlight"]);

		await page
			.getByRole("button", { name: "Northlight", exact: true })
			.dragTo(page.getByRole("button", { name: "Tidewater", exact: true }));
		await expect
			.poll(() =>
				page
					.locator("[data-book-title]")
					.evaluateAll((els) => els.map((e) => e.getAttribute("data-book-title"))),
			)
			.toEqual(["Northlight", "Tidewater"]);
	});
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("a series chip in the shelf row opens a series", async ({ page }) => {
		await page
			.getByRole("toolbar", { name: "Collections and shelves" })
			.getByTestId("shelf-series")
			.filter({ hasText: "Tide" })
			.click();
		await expect(page.getByRole("heading", { name: "Tide", level: 1 })).toBeVisible();
		await expect(page.getByRole("button", { name: "Riverkeep", exact: true })).toHaveCount(0);
	});

	test("a link to a collection that is gone says so and opens the whole library", async ({
		page,
	}) => {
		await page.goto("/tabs/library?collection=gone");
		await expect(
			page.locator('[data-testid="toast-card"]', { hasText: "That collection no longer exists" }),
		).toBeVisible();
		await expect(page).not.toHaveURL(/collection=/);
		await expect(page.locator("[data-book-title]")).toHaveCount(BOOKS.length);
	});
});
