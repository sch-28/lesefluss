import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/** A refetch hands RSVP a new word index object for the same text; it must not move playback. */

async function openInRsvp(page: Page) {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const saves = await reader.saveCount(page);
	await reader.wheel(page, 800);
	await reader.waitForSaveAbove(page, saves, 5000);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
}

/** Plays until a playback save (one every 2s); returns its word. */
async function playUntilSaved(page: Page): Promise<number> {
	const saves = await reader.saveCount(page);
	await reader.rsvpTogglePlay(page);
	await reader.waitForSaveAbove(page, saves, 5000);
	return reader.lastSavedWord(page);
}

const displayedIndex = async (page: Page) =>
	Number(await page.locator(".rsvp-display").getAttribute("data-word-index"));

/** Refetches the queries under `key` the way a sync pull or a chapter fetch does, and waits for them. */
async function refetch(page: Page, key: unknown[]) {
	await page.evaluate(async (key) => {
		const invalidate = window.__lesefluss_e2e_invalidate;
		if (!invalidate) throw new Error("No __lesefluss_e2e_invalidate hook (DEV build?)");
		await invalidate(key);
	}, key);
}

const refetches: Record<string, (bookId: string) => unknown[]> = {
	"all book queries": () => ["books"],
	"the word index": (bookId) => ["books", bookId, "word-index"],
	"an unrelated query (control)": () => ["book-covers"],
};

for (const [what, keyOf] of Object.entries(refetches)) {
	test(`refetching ${what} during RSVP playback neither rewinds it nor saves an earlier word`, async ({
		page,
	}) => {
		await openInRsvp(page);
		const played = await playUntilSaved(page);
		const id = reader.bookIdFromUrl(page);
		const before = await displayedIndex(page);

		await refetch(page, keyOf(id));

		expect(await displayedIndex(page), "not back at an earlier word").toBeGreaterThanOrEqual(
			before,
		);
		// Still playing onward, so the pause below lands on a word not saved yet.
		await expect.poll(() => displayedIndex(page)).toBeGreaterThan(before);
		const saves = await reader.saveCount(page);
		await reader.rsvpTogglePlay(page);
		await reader.waitForSaveAbove(page, saves, 5000);
		await reader.waitPositionQuiet(page);
		expect(
			await reader.lastSavedWord(page),
			"the pause saves a word past the playback save",
		).toBeGreaterThan(played);
		expect((await reader.savedRow(page, id))?.wordPosition).toBe(await reader.lastSavedWord(page));
	});
}

test("refetching the word index while RSVP is paused leaves the word on screen, and playing resumes from it", async ({
	page,
}) => {
	await openInRsvp(page);
	const start = await displayedIndex(page);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => displayedIndex(page)).toBeGreaterThan(start + 2);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(false);
	const id = reader.bookIdFromUrl(page);
	const paused = { index: await displayedIndex(page), word: await reader.rsvpCurrentWord(page) };

	await refetch(page, ["books", id, "word-index"]);

	expect({ index: await displayedIndex(page), word: await reader.rsvpCurrentWord(page) }).toEqual(
		paused,
	);
	// The engine ignores a toggle within 120ms of the last one (TOGGLE_DEBOUNCE_MS).
	await page.waitForTimeout(200);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => displayedIndex(page)).toBeGreaterThan(paused.index);
});
