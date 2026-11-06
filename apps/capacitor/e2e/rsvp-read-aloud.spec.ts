import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test.use({ viewport: { width: 420, height: 800 } });

/**
 * Read-aloud inside RSVP: a toggle turns the voice on, and RSVP's own play and
 * pause then drive it, with no read-aloud bar. Runs on the DEV fake Tts engine,
 * which speaks only when the test says so.
 */

async function openRsvp(page: Page) {
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	const title = await seedFixture(page, bigBookFixture(), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible();
}

const topBarToggle = (page: Page) =>
	page.locator("header").getByRole("button", { name: "Listen", exact: true });
const controlsToggle = (page: Page) =>
	page.locator(".rsvp-wpm-stepper").getByRole("button", { name: "Listen", exact: true });
const starts = (page: Page) => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0);
const isVoicePlaying = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_tts?.isPlaying() ?? false);
const speak = (page: Page, words: number) =>
	page.evaluate((words) => {
		const tts = window.__lesefluss_e2e_tts;
		if (!tts) throw new Error("No fake Tts engine (DEV build, flag set before load?)");
		tts.speak(words);
	}, words);
const readAloudSaves = (page: Page) =>
	page.evaluate(
		() => window.__lesefluss_e2e_saveLog?.filter((s) => s.source === "read-aloud").length ?? 0,
	);
const lastReadAloudSave = (page: Page) =>
	page.evaluate(
		() =>
			window.__lesefluss_e2e_saveLog?.findLast((s) => s.source === "read-aloud")?.word ??
			Number.NaN,
	);

async function play(page: Page) {
	const before = await starts(page);
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await expect.poll(() => isVoicePlaying(page)).toBe(true);
	return before;
}

/** Pauses by tapping the display; returns the spoken word the pause saved. */
async function pauseByTap(
	page: Page,
	act: () => Promise<void> = () => page.locator(".rsvp-display").click(),
) {
	const saves = await readAloudSaves(page);
	await act();
	await expect.poll(() => isVoicePlaying(page)).toBe(false);
	await expect.poll(() => readAloudSaves(page)).toBeGreaterThan(saves);
	await reader.waitPositionQuiet(page);
	return lastReadAloudSave(page);
}

test("the toggle turns the voice on and off with no read-aloud bar", async ({ page }) => {
	await openRsvp(page);
	const shown = await reader.rsvpCurrentWord(page);
	await expect(topBarToggle(page)).toHaveAttribute("aria-pressed", "false");
	await expect(page.locator(".rsvp-voice-button")).toHaveCount(0);

	await topBarToggle(page).click();
	await expect(topBarToggle(page)).toHaveAttribute("aria-pressed", "true");
	await expect(controlsToggle(page)).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByRole("button", { name: "Voice" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Sleep timer" })).toBeVisible();
	expect(await reader.rsvpCurrentWord(page), "the toggle leaves the view alone").toBe(shown);
	expect(await starts(page), "the toggle doesn't play").toBe(0);

	await play(page);
	expect(await starts(page)).toBe(1);
	await expect(page.getByRole("button", { name: "Voice" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Stop listening" })).toHaveCount(0);
	await speak(page, 3);

	await pauseByTap(page);
	await expect(topBarToggle(page)).toHaveAttribute("aria-pressed", "true");

	await controlsToggle(page).click();
	await expect(topBarToggle(page)).toHaveAttribute("aria-pressed", "false");
	await expect(page.locator(".rsvp-voice-button")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Stop listening" })).toHaveCount(0);

	// Off again, play is RSVP's own timer and starts no voice.
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(true);
	expect(await starts(page)).toBe(1);
});

test("the voice reads from the shown word and the words follow it", async ({ page }) => {
	await openRsvp(page);
	await topBarToggle(page).click();
	await reader.blurFocusedControl(page);
	for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
	await reader.waitPositionQuiet(page);
	const shownAt = (await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition ?? 0;
	const shown = await reader.rsvpCurrentWord(page);

	await play(page);
	await speak(page, 4);
	await expect.poll(() => reader.rsvpCurrentWord(page)).not.toBe(shown);
	expect(await pauseByTap(page), "the voice started at the shown word").toBe(shownAt + 3);
});

test("paused, a step moves the shown word and the next play reads from it", async ({ page }) => {
	await openRsvp(page);
	await topBarToggle(page).click();
	await play(page);
	await speak(page, 10);
	const spoken = await pauseByTap(page);

	await page.getByRole("button", { name: "Forward to next sentence" }).click();
	await reader.waitPositionQuiet(page);
	const stepped = (await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition ?? 0;
	expect(stepped).toBeGreaterThan(spoken);

	await play(page);
	await speak(page, 3);
	expect(await pauseByTap(page), "the voice read on from the stepped word").toBe(stepped + 2);
});

test("paused, a scrub moves the shown word and the next play reads from it", async ({ page }) => {
	await openRsvp(page);
	await topBarToggle(page).click();
	await play(page);
	await speak(page, 10);
	await pauseByTap(page);
	const shown = await reader.rsvpCurrentWord(page);

	const bar = reader.progressBar(page);
	const box = await bar.boundingBox();
	if (!box) throw new Error("No progress bar");
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await reader.waitPositionQuiet(page);
	const scrubbed = (await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition ?? 0;
	await expect.poll(() => reader.rsvpCurrentWord(page)).not.toBe(shown);

	await play(page);
	await speak(page, 3);
	expect(await pauseByTap(page), "the voice read on from the scrubbed word").toBe(scrubbed + 2);
});

test("the audio setting survives a reload", async ({ page }) => {
	await openRsvp(page);
	await controlsToggle(page).click();
	await expect(topBarToggle(page)).toHaveAttribute("aria-pressed", "true");

	await page.reload();
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.toggleRsvp(page);
	await expect(topBarToggle(page)).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByRole("button", { name: "Voice" })).toBeVisible();
});

test("the floating buttons open the voice and sleep timer sheets", async ({ page }) => {
	await openRsvp(page);
	await topBarToggle(page).click();
	await page.getByRole("button", { name: "Sleep timer" }).click();
	await expect(page.getByText("Stop listening after")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByText("Stop listening after")).toHaveCount(0);
	await page.getByRole("button", { name: "Voice" }).click();
	await expect(page.getByText(/^Voice · /)).toBeVisible();
});

test("leaving RSVP pauses the voice and saves the spoken word", async ({ page }) => {
	await openRsvp(page);
	await topBarToggle(page).click();
	await play(page);
	await speak(page, 40);

	const spoken = await pauseByTap(page, () => reader.toggleRsvp(page));
	expect(spoken).toBeGreaterThan(0);
	await expect(
		page.getByRole("button", { name: "Resume listening" }),
		"paused, not stopped",
	).toBeVisible();
	const row = await reader.savedRow(page, reader.bookIdFromUrl(page));
	expect(row?.wordPosition).toBe(spoken);
});

test("the speed stepper sets the voice speed while audio is on", async ({ page }) => {
	await openRsvp(page);
	const value = page.locator(".rsvp-wpm-value");
	const rsvpWpm = Number(await value.textContent());

	await page.getByRole("button", { name: "Increase WPM" }).click();
	await expect(value).toHaveText(String(rsvpWpm + 25));

	await controlsToggle(page).click();
	await expect(value).not.toHaveText(String(rsvpWpm + 25));
	const voiceWpm = Number(await value.textContent());
	await page.getByRole("button", { name: "Increase WPM" }).click();
	await expect(value).toHaveText(String(voiceWpm + 10));

	await controlsToggle(page).click();
	await expect(value).toHaveText(String(rsvpWpm + 25));
	await controlsToggle(page).click();
	await expect(value).toHaveText(String(voiceWpm + 10));
});
