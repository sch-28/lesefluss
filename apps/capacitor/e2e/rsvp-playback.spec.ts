import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test("RSVP play advances the active word; pause stops it", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	expect(await reader.rsvpIsPlaying(page)).toBe(false);

	const initialWord = await reader.rsvpCurrentWord(page);

	// Play: click the display, give the engine ~600ms (at default ~250-300 WPM
	// that's a handful of word advances), then pause.
	await reader.rsvpTogglePlay(page);
	expect(await reader.rsvpIsPlaying(page)).toBe(true);
	await page.waitForTimeout(600);
	await reader.rsvpTogglePlay(page);
	expect(await reader.rsvpIsPlaying(page)).toBe(false);

	const afterPlayWord = await reader.rsvpCurrentWord(page);
	expect(afterPlayWord).not.toBe(initialWord);

	// Pause must hold: another 600ms with no play must show the same word.
	await page.waitForTimeout(600);
	const stillPausedWord = await reader.rsvpCurrentWord(page);
	expect(stillPausedWord).toBe(afterPlayWord);
});
