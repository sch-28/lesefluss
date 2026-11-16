import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Switching tabs or apps hides the page, and a mobile browser may then kill it
 * without another event (LESE-20.4). Whatever was read up to the hide must
 * already be in the database when the page comes back from scratch.
 */

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

const waitSavesDrained = (page: Page) =>
	expect
		.poll(() =>
			page.evaluate(
				() =>
					(window.__lesefluss_e2e_saveRequests ?? 0) - (window.__lesefluss_e2e_saveFinished ?? 0),
			),
		)
		.toBe(0);

async function openBigBook(page: Page): Promise<string> {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	return reader.bookIdFromUrl(page);
}

/** The page comes back from scratch, as after the browser killed the hidden tab. */
async function relaunch(page: Page, bookId: string) {
	await page.reload();
	await reader.expectLoaded(page);
	return reader.savedRow(page, bookId);
}

test("a scroll not yet settled is saved when the tab is hidden", async ({ page }) => {
	const id = await openBigBook(page);
	const before = await reader.savedRow(page, id);
	const requests = await reader.saveRequestCount(page);

	await reader.wheelUnsettled(page, 1200);
	await setVisibility(page, "hidden");
	await waitSavesDrained(page);

	expect(await reader.saveRequestCount(page)).toBeGreaterThan(requests);
	const hidden = await reader.savedRow(page, id);
	expect(hidden?.wordPosition).toBeGreaterThan(before?.wordPosition ?? 0);
	expect((await relaunch(page, id))?.wordPosition).toBe(hidden?.wordPosition);
});

test("a page turned in page mode survives the tab being hidden", async ({ page }) => {
	const id = await openBigBook(page);
	await reader.setPaginationStyle(page, "page");
	await reader.waitFramesIdle(page);
	const before = await reader.savedRow(page, id);

	for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
	await setVisibility(page, "hidden");
	await waitSavesDrained(page);

	const hidden = await reader.savedRow(page, id);
	expect(hidden?.wordPosition).toBeGreaterThan(before?.wordPosition ?? 0);
	expect((await relaunch(page, id))?.wordPosition).toBe(hidden?.wordPosition);
});

test("RSVP playing when the tab is hidden pauses and saves its word", async ({ page }) => {
	const id = await openBigBook(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	const before = await reader.savedRow(page, id);
	const startWord = await reader.rsvpCurrentWord(page);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpCurrentWord(page)).not.toBe(startWord);

	await setVisibility(page, "hidden");
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(false);
	await waitSavesDrained(page);

	const hidden = await reader.savedRow(page, id);
	expect(hidden?.wordPosition).toBeGreaterThan(before?.wordPosition ?? 0);
	expect((await relaunch(page, id))?.wordPosition).toBe(hidden?.wordPosition);
});

test("reading time up to the hide is kept", async ({ page }) => {
	// Fakes the clock so the noise floor's minute of reading costs no wall time.
	await page.clock.install();
	const id = await openBigBook(page);
	for (let i = 0; i < 8; i++) {
		await reader.wheel(page, 120);
		await page.waitForTimeout(300);
		await page.clock.fastForward(10_000);
	}
	const persisted = await page.evaluate(() => window.__lesefluss_e2e_session?.count ?? 0);

	await setVisibility(page, "hidden");
	await expect
		.poll(() => page.evaluate(() => window.__lesefluss_e2e_session?.count ?? 0))
		.toBeGreaterThan(persisted);

	await page.reload();
	await reader.expectLoaded(page);
	await expect
		.poll(async () => {
			const rows = await page.evaluate(
				(bookId) => window.__lesefluss_e2e_readBookSessions?.(bookId),
				id,
			);
			return rows?.reduce((sum, row) => sum + row.durationMs, 0) ?? 0;
		})
		.toBeGreaterThan(0);
});
