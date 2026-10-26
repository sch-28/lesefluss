import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A book's updatedAt is its position's last-write-wins revision. A flush that
 * writes the word the row already holds (the app going to the background, a
 * page hide, leaving the reader) must not stamp a new one: an idle open reader
 * would keep making its word "newest" and win over a later read elsewhere.
 */

// A flush's DB write is async; one that was going to happen has committed by then.
// The save-request count is checked as well, so a slow write can't pass for none.
const FLUSH_MS = 500;

async function setVisibility(page: Page, state: "hidden" | "visible") {
	await page.evaluate((state) => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
		Object.defineProperty(document, "hidden", {
			configurable: true,
			get: () => state === "hidden",
		});
		document.dispatchEvent(new Event("visibilitychange"));
	}, state);
}

const syncPushRequestCount = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_syncPushRequests ?? 0);

/** Hides the app and brings it back, as switching apps does, then a page hide. */
async function backgroundRepeatedly(page: Page) {
	for (let i = 0; i < 3; i++) {
		await setVisibility(page, "hidden");
		await page.waitForTimeout(FLUSH_MS);
		await setVisibility(page, "visible");
	}
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	await page.waitForTimeout(FLUSH_MS);
}

/** Opens the big book and scrolls with the wheel until a position is saved; returns the book id. */
async function openAndMove(page: Page): Promise<string> {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const saves = await reader.saveCount(page);
	await reader.wheel(page, 800);
	await reader.waitForSaveAbove(page, saves, 5000);
	return reader.bookIdFromUrl(page);
}

test("going to the background and back without moving rewrites nothing", async ({ page }) => {
	const id = await openAndMove(page);
	const before = await reader.savedRow(page, id);
	const requests = await reader.saveRequestCount(page);

	await backgroundRepeatedly(page);

	expect(await reader.saveRequestCount(page)).toBe(requests);
	expect(await reader.savedRow(page, id)).toEqual(before);
});

test("a real move after that still saves, with a new revision", async ({ page }) => {
	const id = await openAndMove(page);
	await backgroundRepeatedly(page);
	const before = await reader.savedRow(page, id);

	const saves = await reader.saveCount(page);
	await reader.wheel(page, 800);
	await reader.waitForSaveAbove(page, saves, 5000);

	const after = await reader.savedRow(page, id);
	expect(after?.wordPosition).not.toBe(before?.wordPosition);
	expect(after?.updatedAt).toBeGreaterThan(before?.updatedAt ?? Number.POSITIVE_INFINITY);
});

test("leaving the reader without moving since the last save rewrites nothing", async ({ page }) => {
	const id = await openAndMove(page);
	const before = await reader.savedRow(page, id);
	const requests = await reader.saveRequestCount(page);

	await reader.leaveFlushed(page);

	expect(await reader.saveRequestCount(page)).toBe(requests);
	expect(await reader.savedRow(page, id)).toEqual(before);
});

test("RSVP paused on a saved word, then backgrounded and left, rewrites nothing", async ({
	page,
}) => {
	const id = await openAndMove(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	const startWord = await reader.rsvpCurrentWord(page);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpCurrentWord(page)).not.toBe(startWord);
	const saves = await reader.saveCount(page);
	await reader.rsvpTogglePlay(page);
	await reader.waitForSaveAbove(page, saves, 5000);
	const paused = await reader.savedRow(page, id);
	const requests = await reader.saveRequestCount(page);

	await backgroundRepeatedly(page);
	const pushes = await syncPushRequestCount(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toHaveCount(0);
	await page.waitForTimeout(FLUSH_MS);

	expect(await reader.saveRequestCount(page)).toBe(requests);
	expect(await reader.savedRow(page, id)).toEqual(paused);
	// The pause saved without a push; leaving RSVP is what sends it.
	expect(await syncPushRequestCount(page)).toBeGreaterThan(pushes);
});
