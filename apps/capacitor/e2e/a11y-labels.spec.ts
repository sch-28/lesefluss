import { expect, type Page, test } from "@playwright/test";
import { a11yProblems } from "./helpers/a11y-audit";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Every control on the way a screen-reader user listens to a book (library,
 * open the book, Listen) and in the reader's toolbar, sheets and popovers has a
 * name TalkBack can announce, and nothing is clickable without saying what it is.
 */

test.use({ viewport: { width: 420, height: 800 }, contextOptions: { reducedMotion: "reduce" } });

/** Known generic clickables, each with a task to fix it. */
const KNOWN_CLICKABLES = [
	// The paused RSVP view holds its own Play button; a button may not contain buttons.
	".rsvp-display--paused",
];

async function expectAccessible(page: Page, where: string) {
	// Polled: right after a route change the AX tree can lag the laid-out DOM.
	await expect.poll(() => a11yProblems(page, KNOWN_CLICKABLES), { message: where }).toEqual([]);
}

async function openWithFakeTts(page: Page) {
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	return seedFixture(page, bigBookFixture(), "big.epub");
}

test("library to read-aloud: every control is named, nothing clickable is anonymous", async ({
	page,
}) => {
	const title = await openWithFakeTts(page);
	await expectAccessible(page, "library");

	await page.getByRole("button", { name: "Add book" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expectAccessible(page, "import sheet");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);

	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await expectAccessible(page, "reader");

	await reader.openAppearance(page);
	await expectAccessible(page, "appearance popover");
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);

	await reader.openContents(page);
	await expect(page.locator('[data-slot="drawer-content"]')).toBeVisible();
	await expectAccessible(page, "annotations sheet");
	await page.keyboard.press("Escape");
	await expect(page.locator('[data-slot="drawer-content"]')).toHaveCount(0);

	await reader.startListening(page);
	await expect.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0)).toBe(1);
	await expectAccessible(page, "read-aloud controls");
	await page.getByRole("button", { name: "Stop listening" }).click();

	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible();
	await expectAccessible(page, "rsvp");
	await expect(page.locator(".sr-only", { hasText: "Listen button" })).toHaveCount(1);
	await reader.toggleRsvp(page);

	await reader.setPaginationStyle(page, "page");
	await expect(page.locator(".sr-only", { hasText: "Listen button" })).toHaveCount(1);
	await expectAccessible(page, "page mode");

	await page.getByRole("button", { name: "More actions" }).click();
	await expectAccessible(page, "reader menu");
	await page.getByRole("menuitem", { name: "Book details", exact: true }).click();
	await page.waitForURL(/\/tabs\/library\/book\//);
	await expectAccessible(page, "book page");
});

test("Tab reaches a library card, and both Enter and Space open it", async ({ page }) => {
	const title = await seedFixture(page, bigBookFixture(), "big.epub");
	const card = page.locator(`[data-book-title="${title}"]`).first();
	const tabToCard = async () => {
		await expect(card).toBeVisible();
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press("Tab");
			if (await card.evaluate((el) => el === document.activeElement)) return;
		}
		throw new Error("Tab never reached the library card");
	};

	for (const key of ["Enter", "Space"]) {
		await tabToCard();
		await page.keyboard.press(key);
		await page.waitForURL(/\/tabs\/reader\//);
		await reader.expectLoaded(page);
		await page.goBack();
		await page.waitForURL(/\/tabs\/library/);
	}
});

// The control: an icon-only menu button with an aria-label passes desktop
// Chrome's tree, yet TalkBack on Android finds it unnamed; the audit says so.
test("the audit reports a menu button whose name is only an aria-label", async ({ page }) => {
	await page.goto("/");
	await page.setContent(`
		<button aria-haspopup="menu" aria-label="Icon only"><svg aria-hidden="true" width="20" height="20"></svg></button>
		<button aria-haspopup="menu"><svg aria-hidden="true" width="20" height="20"></svg><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">With text</span></button>`);
	const problems = await a11yProblems(page);
	expect(problems.some((p) => p.includes("Icon only"))).toBe(true);
	expect(problems.some((p) => p.includes("With text"))).toBe(false);
});
