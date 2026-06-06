import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Regression for the jump → scroll-settle race: after a TOC jump,
 * `handleScrollPositionSettle` was overwriting the freshly-saved chapter
 * position with the viewport-top word (still inside the previous chapter on
 * tall scroll viewports). reader/index.tsx now stamps `lastJumpAtRef` in
 * `jumpToWord` and skips settle saves within `JUMP_SETTLE_GUARD_MS = 1500ms`.
 */
test("scroll-settle after a TOC jump must not rewind the saved word position", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	const savePending = reader.waitForNextSave(page);
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await savePending;

	const wordAtJump = await reader.lastSavedWord(page);
	expect(wordAtJump).toBeGreaterThan(0);

	// Reader caps the guard at JUMP_SETTLE_GUARD_MS=1500ms (reader/index.tsx).
	// Wait that long + a 300ms render-flush margin so any racing scroll-settle
	// definitely tried to fire before we re-read the saved word.
	const JUMP_SETTLE_GUARD_MS = 1500;
	await page.waitForTimeout(JUMP_SETTLE_GUARD_MS + 300);
	const wordAfterGuard = await reader.lastSavedWord(page);
	expect(wordAfterGuard).toBe(wordAtJump);
});
