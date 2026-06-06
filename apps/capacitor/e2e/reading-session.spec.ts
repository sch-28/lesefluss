import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * CONTEXT.md: Session — continuous reading session, persisted to
 * `reading_sessions`. SessionTracker flushes on bookId/mode change AND on
 * component unmount. Closing the reader must trigger exactly one flush.
 */
test("opening then closing a book writes a reading_sessions flush row", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);

	await openBookFromLibrary(page, title);

	// Drive enough reader activity to clear MIN_DURATION_MS=5s and MIN_WORDS=5.
	// Wheel-scrolling fires the same handleScrollPositionSettle callback that
	// markActivity() hangs off in production, so this is the real session
	// open-and-accumulate path, not a synthetic stub.
	for (let i = 0; i < 7; i++) {
		await page.mouse.wheel(0, 120);
		await page.waitForTimeout(900);
	}

	// Close reader via back button to keep app context (full goto can race the
	// pending upsertReadingSession promise on the about-to-be-discarded page).
	await page.getByRole("button", { name: "Back" }).first().click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 5000 });

	await expect
		.poll(async () => page.evaluate(() => window.__lesefluss_e2e_session?.count ?? 0), {
			timeout: 10_000,
		})
		.toBeGreaterThanOrEqual(1);

	const session = await page.evaluate(() => window.__lesefluss_e2e_session ?? null);
	expect(session, "session hook should be populated after close").not.toBeNull();
	expect(session?.lastKind).toBe("flush");
	expect(session?.count ?? 0).toBeGreaterThanOrEqual(1);
});
