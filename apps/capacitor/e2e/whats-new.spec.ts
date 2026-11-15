import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/** Marks the changelog unseen, as an update does, and reloads so the popup opens on its own. */
async function openAfterUpdate(page: Page) {
	await page.evaluate(() => {
		const db = window.__lesefluss_e2e_db;
		if (!db) throw new Error("No __lesefluss_e2e_db hook");
		return db.execute(
			"UPDATE settings SET last_seen_changelog_date = '2026-11-01', onboarding_completed = 1",
		);
	});
	await page.reload();
	await expect(page.getByTestId("whats-new-tile")).toHaveCount(3);
}

const scrollOverflow = (page: Page) =>
	page.getByTestId("whats-new-scroll").evaluate((el) => el.scrollHeight - el.clientHeight);

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1280, height: 800 },
]) {
	test(`the tiles and Also new fit without scrolling at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await seedStrayAnchorBook(page);
		await openAfterUpdate(page);
		// A 3-button Android navigation bar, the tallest bottom inset.
		await page.evaluate(() =>
			document.documentElement.style.setProperty("--safe-area-inset-bottom", "48px"),
		);
		await expect.poll(() => scrollOverflow(page)).toBeLessThanOrEqual(0);
		await expect(page.getByRole("button", { name: /^Also new/ })).toBeInViewport({ ratio: 1 });
	});
}

test("Show me on RSVP over the open book switches that book to RSVP", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	// The last read book is only stamped by a real position save.
	const baseline = await reader.saveCount(page);
	await reader.moveToChapter(page, "2: Second");
	await reader.waitForSaveAbove(page, baseline, 10_000);
	await expect(page.locator(".rsvp-display")).toHaveCount(0);

	await openAfterUpdate(page);
	await page.getByRole("button", { name: "Show me: RSVP with sound" }).click();
	await expect(page.getByTestId("whats-new")).toBeHidden();
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	await expect(page).not.toHaveURL(/mode=rsvp/);
});
