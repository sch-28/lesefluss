import { expect, type Locator, type Page, test } from "@playwright/test";
import { seedLibrary } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

// A 1262x606 window is a 1280x720 laptop screen minus browser chrome: the shortest desktop the
// app lays out for. Every click below is a real pointer click (locator.click), never element.click().
const SHORT = { width: 1262, height: 606 };

const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance", series: { name: "Tide", index: 2 } },
	{ title: "Northlight", creator: "Ada Vance", series: { name: "Tide", index: 1 } },
	{ title: "Riverkeep", creator: "Bo Lind" },
] as const;

test.use({ viewport: SHORT });

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
});

const GUTTER = 16;

/** The menu stays whole inside the window and keeps the page gutter on both sides. */
async function expectInGutter(page: Page, target: Locator) {
	await expect(target).toBeInViewport({ ratio: 1 });
	const box = await target.boundingBox();
	const { width } = page.viewportSize() ?? SHORT;
	expect(box?.x).toBeGreaterThanOrEqual(GUTTER);
	expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width - GUTTER);
}

const libraryNavLink = (page: Page) =>
	page.getByRole("navigation").getByRole("link", { name: "Library", exact: true });

async function createCollection(page: Page, name: string) {
	await page
		.getByRole("region", { name: "Collections" })
		.getByRole("button", { name: "New collection" })
		.click();
	await page.getByRole("textbox", { name: "Name" }).fill(name);
	await page.getByRole("button", { name: "Riverkeep Bo Lind" }).click();
	await page.getByRole("button", { name: "Create with 1 book" }).click();
	await expect(
		page.getByRole("region", { name: "Collections" }).getByRole("link", { name: `${name} 1` }),
	).toBeVisible();
}

/** Opens the page header's ⋯ and checks the menu opens anchored, whole, inside the window. */
async function expectHeaderMenuOnScreen(page: Page, name: string, item: string) {
	await page
		.locator("[data-scroll-restoration-id=app-scroll]")
		.getByRole("button", { name: `${name} options` })
		.click();
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible();
	await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
	await expectInGutter(page, menu);
	await expect(page.locator("[data-vaul-drawer]")).toHaveCount(0);
}

test("collection and series header menus open anchored and on screen", async ({ page }) => {
	await expect(libraryNavLink(page)).toHaveAttribute("data-active", "true");
	await createCollection(page, "Holiday");
	await page
		.getByRole("region", { name: "Collections" })
		.getByRole("link", { name: "Holiday 1" })
		.click();
	await expect(page).toHaveURL(/collection=/);
	await expect(libraryNavLink(page)).toHaveAttribute("data-active", "false");
	await expectHeaderMenuOnScreen(page, "Holiday", "Edit collection");
	await page.keyboard.press("Escape");

	await page.getByRole("region", { name: "Series" }).getByRole("link", { name: "Tide 2" }).click();
	await expect(page.getByRole("heading", { name: "Tide", level: 1 })).toBeVisible();
	await expect(libraryNavLink(page)).toHaveAttribute("data-active", "false");
	await expectHeaderMenuOnScreen(page, "Tide", "Edit series");
	await page.keyboard.press("Escape");

	await page.getByRole("button", { name: "Collapse sidebar" }).click();
	await expect(libraryNavLink(page)).toHaveAttribute("data-active", "true");
});

test("every sidebar heading and its + stay in view with several lists", async ({ page }) => {
	for (const name of ["Holiday", "Commute", "Shelf three", "Shelf four"]) {
		await createCollection(page, name);
	}
	for (const [region, button] of [
		["Smart shelves", "New smart shelf"],
		["Collections", "New collection"],
		["Series", "New series"],
	] as const) {
		const section = page.getByRole("region", { name: region });
		// ratio 1 also fails when an overflow ancestor clips the element.
		await expect(section.getByRole("heading", { name: region })).toBeInViewport({ ratio: 1 });
		await expect(section.getByRole("button", { name: button })).toBeInViewport({ ratio: 1 });
	}

	const collections = page.getByRole("region", { name: "Collections" });
	await collections.getByRole("link", { name: "Shelf four 1" }).click();
	await expect(page).toHaveURL(/collection=/);
	await page.reload();
	await expect(collections.getByRole("link", { name: "Shelf four 1" })).toBeInViewport({
		ratio: 1,
	});
});
