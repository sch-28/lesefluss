import { expect, type Page, test } from "@playwright/test";
import { textLayoutProblems } from "./helpers/layout-check";
import { bookCard, openTable, seedLibrary } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";
import { emulateTextZoom } from "./helpers/text-zoom";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance", series: { name: "Tide", index: 2 } },
	{ title: "Northlight", creator: "Ada Vance", series: { name: "Tide", index: 1 } },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.use({ contextOptions: { reducedMotion: "reduce" } });

function selectionBar(page: Page) {
	return page.getByRole("toolbar", { name: "Selection" });
}

test.describe("desktop at 1024 px", () => {
	test.use({ viewport: { width: 1024, height: 768 } });

	test.beforeEach(async ({ page }) => {
		await resetStorage(page);
		await seedLibrary(page, BOOKS);
	});

	test("the header Select starts an empty selection with labelled actions", async ({ page }) => {
		await page.getByRole("button", { name: "Select books" }).click();
		const bar = selectionBar(page);
		await expect(bar.getByText("0 selected")).toBeVisible();
		for (const name of ["Status", "Collection", "Series", "Delete"]) {
			await expect(bar.getByRole("button", { name, exact: true })).toBeDisabled();
		}
		await bookCard(page, "Riverkeep").click();
		await expect(bar.getByText("1 selected")).toBeVisible();
		await expect(bar.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
	});

	test("one Add book in the header and no floating button", async ({ page }) => {
		await expect(page.getByRole("button", { name: "Add book" })).toHaveCount(1);
		await expect(page.getByRole("button", { name: "Add book" })).toBeVisible();
	});

	test("the cover #N follows the Series card option", async ({ page }) => {
		const badges = page.getByTestId("series-number-badge");
		await expect(page.locator("[data-book-title]")).toHaveCount(3);
		await expect(badges).toHaveCount(0);
		await page.getByRole("button", { name: "View", exact: true }).click();
		await page.getByRole("checkbox", { name: "Series and #N" }).check();
		await page.keyboard.press("Escape");
		await expect(badges).toHaveCount(2);
	});

	test("a series opens without the query typed on All books", async ({ page }) => {
		await page.getByRole("combobox", { name: "Search library" }).fill("Riverkeep");
		await expect(page.locator("[data-book-title]")).toHaveCount(1);
		await page.getByRole("region", { name: "Series" }).getByRole("link", { name: /^Tide/ }).click();
		await expect(page.getByRole("heading", { name: "Tide", level: 1 })).toBeVisible();
		await expect(page.locator("[data-book-title]")).toHaveCount(2);
	});

	test("an emptied search left behind does not take the next Escape", async ({ page }) => {
		await page.getByRole("combobox", { name: "Search library" }).click();
		await page.getByRole("heading", { name: "Library", level: 1 }).click();
		await page.getByRole("button", { name: "Select books" }).click();
		await expect(selectionBar(page)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(selectionBar(page)).toHaveCount(0);
	});

	test("the table fits its width", async ({ page }) => {
		await openTable(page);
		const table = page.getByTestId("library-table");
		const overflow = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
	});
});

test.describe("touch tablet at 820 px", () => {
	test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false });

	test("the sidebar is a rail with no keyboard tools, and opening it keeps the stored choice", async ({
		page,
	}) => {
		await resetStorage(page);
		await page.goto("/tabs/library");
		const sidebar = page.locator("[data-desktop-sidebar]");
		await expect(sidebar).toBeVisible();
		expect((await sidebar.boundingBox())?.width ?? 0).toBeLessThan(100);
		await expect(page.getByRole("button", { name: "Command palette" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Keyboard shortcuts" })).toHaveCount(0);

		const stored = () => page.evaluate(() => localStorage.getItem("sidebar-collapsed"));
		const before = await stored();
		await page.getByRole("button", { name: "Expand sidebar" }).click();
		await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(150);
		expect(await stored()).toBe(before);

		await page.getByRole("link", { name: "Stats" }).click();
		await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeLessThan(100);
	});
});

test.describe("200 % text on a 390 px phone", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("the selection bar fits", async ({ page }) => {
		await emulateTextZoom(page, 2);
		await resetStorage(page);
		await seedLibrary(page, BOOKS);
		await page.getByRole("button", { name: "Select books" }).click();
		await bookCard(page, "Riverkeep").click();
		await expect(selectionBar(page).getByText("1 selected")).toBeVisible();
		expect(await textLayoutProblems(page, '[role="toolbar"][aria-label="Selection"]')).toEqual([]);
	});
});
