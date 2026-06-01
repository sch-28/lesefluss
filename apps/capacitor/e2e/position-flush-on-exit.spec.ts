import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * Companion to position-restore.spec.ts. That test waits for `savePosition()`
 * to commit before navigating away, so it only exercises the happy path. These
 * cover leaving the reader WITHOUT a clean unmount (the mobile background-kill
 * or a web tab close), where the only existing flush (React unmount) never runs.
 */

test("jump position survives a hard reload right after moving (no explicit save wait)", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);

	await openBookFromLibrary(page, title);
	await expect(page.locator("body")).toContainText(
		"Chapter 1 opening paragraph anchors the scene.",
	);

	// Jump to chapter 2, then immediately reload, racing the async position
	// write. (jumpToWord saves eagerly, so this is expected to survive; it is a
	// regression guard for the deliberate-exit path.)
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await page.reload();
	await reader.expectLoaded(page);

	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");
	await expect(ch2).toBeVisible({ timeout: 10_000 });
	await expect(ch2).toBeInViewport();
});

/**
 * RSVP saves are throttled to every 2s inside the engine, so the displayed word
 * runs ahead of the DB for up to 2s. When the app is backgrounded mid-window
 * (pagehide), that fresh position must be flushed, otherwise resume rewinds to
 * the last throttled save. `pagehide` is dispatched alone (document stays
 * "visible"), so the engine's existing visibilitychange auto-pause does NOT fire
 * and we test the teardown flush in isolation.
 */
test("RSVP flushes the freshest position when the app is backgrounded (pagehide)", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);

	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);

	await reader.toggleRsvp(page);
	await reader.rsvpTogglePlay(page);

	// Catch the first throttled save (~2s in); the displayed word now runs ahead.
	await reader.waitForNextSave(page);
	const savedAfterFirst = await reader.lastSavedWord(page);
	const countAfterFirst = await reader.saveCount(page);

	// Advance a few words inside the same throttle window: displayed but unsaved.
	await page.waitForTimeout(500);

	// Background via pagehide only. The next throttled save would not land for
	// ~1.5s, so a new save inside 1100ms can only come from a teardown flush.
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

	await reader.waitForSaveAbove(page, countAfterFirst, 1100);
	const flushed = await reader.lastSavedWord(page);
	expect(flushed).toBeGreaterThanOrEqual(savedAfterFirst);
});
