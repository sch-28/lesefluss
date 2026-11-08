import { expect, type Page, test } from "@playwright/test";
import { seedLibrary, visibleTitles } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance" },
	{ title: "Northlight", creator: "Ada Vance" },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.use({ viewport: { width: 1400, height: 900 } });

const focused = (page: Page) =>
	page.locator("[data-focused] [data-book-title], [data-focused][data-book-title]");

async function focusedTitle(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		const el = document.querySelector("[data-focused]");
		return (
			el?.getAttribute("data-book-title") ??
			el?.querySelector("[data-book-title]")?.getAttribute("data-book-title") ??
			null
		);
	});
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
	// Keys go to the page, not a control that kept focus after setup.
	await page.locator("body").click({ position: { x: 700, y: 880 } });
});

test("j and k move the focus, x selects, Esc steps back out", async ({ page }) => {
	const order = await visibleTitles(page);

	await page.keyboard.press("j");
	await expect.poll(() => focusedTitle(page)).toBe(order[0]);
	await page.keyboard.press("j");
	await expect.poll(() => focusedTitle(page)).toBe(order[1]);
	await page.keyboard.press("k");
	await expect.poll(() => focusedTitle(page)).toBe(order[0]);

	await page.keyboard.press("x");
	await expect(page.getByText("1 selected")).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("x");
	await expect(page.getByText("2 selected")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(page.getByText(/\d selected/)).toHaveCount(0);
	await expect.poll(() => focusedTitle(page)).toBe(order[1]);
	await page.keyboard.press("Escape");
	await expect.poll(() => focusedTitle(page)).toBeNull();
	await expect(focused(page)).toHaveCount(0);
});

test("Enter opens the focused book", async ({ page }) => {
	await page.keyboard.press("j");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/tabs\/reader\//);
});

test("/ focuses the search and Esc clears it", async ({ page }) => {
	await page.keyboard.press("/");
	const box = page.getByRole("combobox", { name: "Search library" });
	await expect(box).toBeFocused();
	await page.keyboard.type("river");
	await expect(page.locator("[data-book-title]")).toHaveCount(1);
	await page.keyboard.press("Escape");
	await expect(page.locator("[data-book-title]")).toHaveCount(BOOKS.length);
});

test("a digit rates the focused book and S sets its status", async ({ page }) => {
	const shelves = page.getByRole("region", { name: "Smart shelves" });
	await page.keyboard.press("j");
	await expect.poll(() => focusedTitle(page)).not.toBeNull();
	const title = await focusedTitle(page);

	await page.keyboard.press("s");
	// A press within ANCHOR_MAX_AGE_MS (the setup's click) makes the short list a menu, else a sheet.
	await page
		.getByRole("menuitem", { name: "Finished", exact: true })
		.or(page.getByRole("button", { name: "Finished", exact: true }))
		.click();
	await expect(shelves.getByRole("link", { name: "Finished Pinned 1" })).toBeVisible();
	await expect(shelves.getByRole("link", { name: "Unrated Pinned 1" })).toBeVisible();

	await page.locator("body").click({ position: { x: 700, y: 880 } });
	await page.keyboard.press("4");
	await expect(shelves.getByRole("link", { name: "Unrated Pinned 0" })).toBeVisible();

	await page.keyboard.press("/");
	await page.keyboard.type("rating:>=4");
	await page.keyboard.press("Enter");
	expect(await visibleTitles(page)).toEqual([title]);
});

test("G opens the group-by choice, and a group folds to its heading", async ({ page }) => {
	await page.keyboard.press("g");
	await page
		.getByRole("radiogroup", { name: "Group by" })
		.getByRole("radio", { name: "Author" })
		.click();
	await page.keyboard.press("Escape");

	const headers = page.getByTestId("library-group-header");
	await expect(headers).toHaveCount(2);
	await expect(headers.nth(0)).toContainText("Ada Vance");
	await expect(headers.nth(0)).toContainText("2");
	await expect(headers.nth(1)).toContainText("Bo Lind");

	await headers.nth(0).click();
	await expect(headers.nth(0)).toHaveAttribute("aria-expanded", "false");
	await expect(page.locator("[data-book-title]")).toHaveCount(1);
	await expect(page.locator('[data-book-title="Riverkeep"]')).toBeVisible();
});

test("the shortcut sheet lists the library keys", async ({ page }) => {
	await page.keyboard.press("?");
	const sheet = page.getByRole("dialog");
	await expect(sheet).toContainText("Next book");
	await expect(sheet).toContainText("Search library");
});
