import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Quick RSVP, the desktop pop-out RSVP window (LESE-128). Driven through its popup
 * tier: Playwright sees a popup as a page of its own, while a Picture-in-Picture
 * window is only reachable from its opener. Both tiers share the window and the
 * reader's follow; the bridge tests cover the PiP link.
 */

const savedWord = async (page: Page, bookId: string) =>
	(await reader.savedRow(page, bookId))?.wordPosition;

const miniWord = async (mini: Locator) => Number(await mini.getAttribute("data-word"));

async function openReaderAtLaterWord(page: Page): Promise<{ bookId: string; start: number }> {
	// Without Document Picture-in-Picture the app opens the popup tier, as in Firefox.
	await page.addInitScript(() => {
		delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
	});
	await seedFixture(page, plainBookFixture(), "plain.epub");
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.waitPositionQuiet(page);
	const bookId = reader.bookIdFromUrl(page);
	const settles = await reader.settleCount(page);
	await reader.wheelTargetTo(page, reader.wordSpan(page, "w3x0"), "top");
	await reader.waitForSettleAbove(page, settles);
	await reader.waitPositionQuiet(page);
	const start = await savedWord(page, bookId);
	if (start === undefined || start === 0) throw new Error("The scroll saved no later word");
	return { bookId, start };
}

async function openQuickRsvp(page: Page): Promise<{ popup: Page; mini: Locator }> {
	const popupPromise = page.context().waitForEvent("page");
	await page.getByRole("button", { name: "More actions" }).click();
	await page.getByRole("menuitem", { name: "Quick RSVP" }).click();
	const popup = await popupPromise;
	const mini = popup.getByTestId("mini-window");
	await expect(mini).toBeVisible();
	return { popup, mini };
}

test("opens at the reader's word, both windows follow each other, and the last word is saved", async ({
	page,
}) => {
	const { bookId, start } = await openReaderAtLaterWord(page);
	const { popup, mini } = await openQuickRsvp(page);

	await expect(mini).toHaveAttribute("data-playing", "true");
	expect(await miniWord(mini), "it starts at the reader's word").toBeGreaterThanOrEqual(start);
	expect(await miniWord(mini)).toBeLessThan(start + 40);
	await expect(page.getByTestId("mini-banner")).toContainText("Playing in Quick RSVP");

	// The reader saves the words Quick RSVP reports.
	await expect.poll(() => savedWord(page, bookId), { timeout: 10_000 }).toBeGreaterThan(start);

	await popup.keyboard.press("Space");
	await expect(mini).toHaveAttribute("data-playing", "false");
	const paused = await miniWord(mini);
	await expect.poll(() => savedWord(page, bookId)).toBe(paused);
	await expect(page.getByTestId("mini-banner")).toContainText("Paused in Quick RSVP");

	// A move in the reader pauses Quick RSVP on the reader's word.
	await popup.waitForTimeout(150); // past the engine's 120 ms toggle debounce
	await popup.keyboard.press("Space");
	await expect(mini).toHaveAttribute("data-playing", "true");
	// The user turns to the reader's window; a background window gets too few frames to settle a scroll.
	await page.bringToFront();
	const settles = await reader.settleCount(page);
	await reader.wheel(page, 1200);
	await reader.waitForSettleAbove(page, settles);
	await reader.waitPositionQuiet(page);
	await expect(mini).toHaveAttribute("data-playing", "false");
	const moved = await savedWord(page, bookId);
	await expect.poll(() => miniWord(mini)).toBe(moved);

	// Leaving the book stops it at the saved word.
	await popup.keyboard.press("Space");
	await expect.poll(() => miniWord(mini)).toBeGreaterThan(moved ?? 0);
	await page.getByRole("button", { name: "Back" }).first().click();
	await expect(popup.getByTestId("mini-stopped")).toBeVisible();
	await expect.poll(() => savedWord(page, bookId)).toBe(await miniWord(mini));
	await expect(page.getByText(/another device/i)).toHaveCount(0);
});

test("a reader mode switch leaves it playing, and a device move reaches it while paused", async ({
	page,
}) => {
	const { bookId, start } = await openReaderAtLaterWord(page);
	const { popup, mini } = await openQuickRsvp(page);
	await expect.poll(() => savedWord(page, bookId), { timeout: 10_000 }).toBeGreaterThan(start);

	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible();
	const onSwitch = await miniWord(mini);
	// Past the next report, so the reader's idle RsvpView lags the window.
	await expect.poll(() => miniWord(mini)).toBeGreaterThan(onSwitch + 15);
	const beforeSwitchBack = await miniWord(mini);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeHidden();
	await expect.poll(() => miniWord(mini)).toBeGreaterThan(beforeSwitchBack + 5);
	await expect(mini).toHaveAttribute("data-playing", "true");

	await popup.keyboard.press("Space");
	await expect(mini).toHaveAttribute("data-playing", "false");
	const deviceWord = (await miniWord(mini)) + 600;
	await page.evaluate((word) => window.__lesefluss_e2e_devicePosition?.(word), deviceWord);
	await expect.poll(() => miniWord(mini)).toBe(deviceWord);
	await expect(mini).toHaveAttribute("data-playing", "false");
});

test.describe("on a phone", () => {
	const { defaultBrowserType: _, ...pixel } = devices["Pixel 7"];
	test.use(pixel);

	test("Quick RSVP is offered neither in the menu nor in the palette", async ({ page }) => {
		await seedFixture(page, plainBookFixture(), "plain.epub");
		await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
		await reader.expectLoaded(page);
		await page.getByRole("button", { name: "More actions" }).click();
		await expect(page.getByRole("menuitem", { name: "Book details" })).toBeVisible();
		await expect(page.getByRole("menuitem", { name: "Quick RSVP" })).toHaveCount(0);
		await page.keyboard.press("Escape");
		await page.keyboard.press("Control+k");
		const palette = page.getByTestId("command-palette");
		await expect(palette).toBeVisible();
		await palette.getByRole("combobox").fill("rsvp");
		await expect(palette.getByRole("option", { name: /Quick RSVP/ })).toHaveCount(0);
	});
});
