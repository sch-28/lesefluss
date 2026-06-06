import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Durable-resume layer (src/pages/reader/pending-position.ts). `savePosition`
 * mirrors each write to localStorage synchronously; if the async DB write is
 * abandoned by a teardown, the next mount recovers it, but ONLY when the entry
 * is strictly newer than the row's lastRead, so a committed save or a cloud
 * sync always wins.
 *
 * To simulate a PREVIOUS session's orphaned write we leave the reader first
 * (so nothing overwrites the entry), plant it directly, then reopen. Chromium
 * commits real async writes before navigation, so a genuine orphan can't be
 * produced by timing alone; the planted entry stands in for one.
 */

// Open the book and move the DB to chapter 2, waiting for the jump scroll to
// settle so the position is stable, then return its id + saved word.
async function openAtChapterTwo(page: Page): Promise<{ title: string; bookId: string }> {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await expect(page.locator("body")).toContainText(
		"Chapter 1 opening paragraph anchors the scene.",
	);

	const savePending = reader.waitForNextSave(page);
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await savePending;

	return { title, bookId: reader.bookIdFromUrl(page) };
}

// Leave the reader (client-side back) so it unmounts and stops mirroring the
// position to localStorage. Wait for the unmount flush to clear its own pending
// entry, so a subsequently planted orphan can't be overwritten by it.
async function leaveReader(page: Page, bookId: string): Promise<void> {
	await page.goBack();
	await expect(page).toHaveURL(/\/tabs\/library/);
	await expect.poll(() => reader.getPendingPosition(page, bookId), { timeout: 5000 }).toBeNull();
}

test("recovers a strictly-newer orphaned position on the next open", async ({ page }) => {
	const { title, bookId } = await openAtChapterTwo(page);
	const dbWord = await reader.lastSavedWord(page);

	await leaveReader(page, bookId);

	// A position a few words further on, as if the previous session's teardown
	// left an uncommitted write. Synthetic so it can't collide with a same-text
	// word the virtual list still has buffered.
	const orphanWord = dbWord + 3;
	await reader.setPendingPosition(page, bookId, orphanWord, 60_000);
	const baseline = await reader.saveCount(page);

	// Reopen: the mount reconcile recovers it and writes it back to the DB.
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitForSaveAbove(page, baseline, 10_000);
	expect(await reader.lastSavedWord(page)).toBe(orphanWord);
	// Consumed exactly once: nothing left to resurrect on a later mount.
	expect(await reader.getPendingPosition(page, bookId)).toBeNull();
});

test("ignores a stale orphaned position older than the DB row", async ({ page }) => {
	const { title, bookId } = await openAtChapterTwo(page);

	await leaveReader(page, bookId);

	// An OLDER entry pointing back at chapter 1's start. The reconcile must keep
	// the newer DB position (chapter 2) and discard this.
	await reader.setPendingPosition(page, bookId, 0, -60_000);

	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);

	// Resumes at chapter 2 (the DB position). Had the stale word-0 entry been
	// applied, the reader would sit at the top of chapter 1 and ch2 would be
	// below the fold, so ch2 being in view is the discriminating signal.
	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");
	await expect(ch2).toBeInViewport({ timeout: 10_000 });
	// Stale entry consumed, not applied.
	expect(await reader.getPendingPosition(page, bookId)).toBeNull();
});
