import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * The reporter's exact flow: read, then use the in-app BACK navigation to the
 * library and reopen the book. This is a client-side route change that unmounts
 * BookReader and runs its teardown flush — distinct from a full page reload
 * (which goes through `pagehide`, already covered by position-restore /
 * position-flush-on-exit).
 *
 * Guards the unmount-flush + durable-fallback path against regression: leaving
 * the reader via the router must neither lose the position nor clobber it with a
 * stale resume seed on the brief route-transition re-mount.
 */
test("position survives in-app back navigation to the library", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);

	await openBookFromLibrary(page, title);
	await expect(page.locator("body")).toContainText(
		"Chapter 1 opening paragraph anchors the scene.",
	);

	// Move position and let the save commit so we are asserting against a real,
	// persisted position (not a race with the throttled autosave).
	const baseline = await reader.saveCount(page);
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await reader.waitForSaveAbove(page, baseline, 10_000);

	// In-app history back to the library (SPA route change -> reader unmounts),
	// NOT a hard reload.
	await page.goBack();
	await page.waitForURL(/\/tabs\/library/);

	await openBookFromLibrary(page, title);
	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");
	await expect(ch2).toBeVisible({ timeout: 10_000 });
	await expect(ch2).toBeInViewport();
});
