import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Read-aloud owns the position only while it plays. Paused, the reader's own
 * moves are reading and are saved; stopped after looking away while it played,
 * the spoken word stays saved and the view browses. Runs on the DEV fake Tts
 * engine, which speaks only when the test says so.
 */

type Mode = "scroll" | "page";

async function openListening(page: Page, mode: Mode, { paragraphs }: { paragraphs?: number } = {}) {
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	const title = await seedFixture(
		page,
		bigBookFixture(paragraphs ? { paragraphCount: paragraphs } : {}),
		"big.epub",
	);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	if (mode === "page") await reader.setPaginationStyle(page, "page");
	await page.getByRole("button", { name: "Listen", exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0)).toBe(1);
}

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

/** Pauses with the player's button; returns the spoken word the pause saved. */
async function pause(page: Page): Promise<number> {
	const saves = await readAloudSaves(page);
	await page.getByRole("button", { name: "Pause listening" }).first().click();
	await expect.poll(() => readAloudSaves(page)).toBeGreaterThan(saves);
	await reader.waitPositionQuiet(page);
	return reader.lastSavedWord(page);
}

/** The reader's own move: a wheel in scroll mode, a key turn in page mode. Waits for its settle. */
async function move(page: Page, mode: Mode) {
	const settles = await reader.settleCount(page);
	if (mode === "scroll") await reader.wheel(page, 1200);
	else {
		await reader.blurFocusedControl(page);
		await page.keyboard.press("ArrowRight");
	}
	await reader.waitForSettleAbove(page, settles);
	await reader.waitPositionQuiet(page);
}

const savedWord = async (page: Page) =>
	(await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition;

for (const mode of ["scroll", "page"] as const) {
	test(`${mode}: paused, the reader's move is saved, and stopping doesn't put the spoken word back`, async ({
		page,
	}) => {
		await openListening(page, mode);
		await speak(page, 30);
		const spoken = await pause(page);

		await move(page, mode);
		const read = await reader.lastSavedWord(page);
		expect(read, "the move was saved").not.toBe(spoken);

		await page.getByRole("button", { name: "Stop listening" }).click();
		await reader.waitPositionQuiet(page);
		expect(await savedWord(page)).toBe(read);
	});

	test(`${mode}: stopped after looking away while it played, the spoken word is saved and the view browses`, async ({
		page,
	}) => {
		await openListening(page, mode);
		await speak(page, 30);
		await move(page, mode);
		await speak(page, 3);

		await page.getByRole("button", { name: "Stop listening" }).click();
		await reader.waitPositionQuiet(page);

		const spoken = await page.evaluate(
			() => window.__lesefluss_e2e_saveLog?.filter((s) => s.source === "read-aloud").at(-1)?.word,
		);
		expect(await savedWord(page)).toBe(spoken);
		await expect(reader.browseBar(page)).toBeVisible();
		const viewed = await reader.commitReadFromHere(page);
		expect(viewed, "Read from here takes the page that was looked at").not.toBe(spoken);
	});
}

test("playing, the reader's move leaves the position with the voice", async ({ page }) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	const saves = await page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0);

	await move(page, "scroll");
	await speak(page, 3);
	const spoken = await pause(page);

	const sources = await page.evaluate(
		(from) => (window.__lesefluss_e2e_saveLog ?? []).slice(from).map((s) => s.source),
		saves,
	);
	expect(sources, "only the voice saved").toEqual(sources.map(() => "read-aloud"));
	expect(await savedWord(page)).toBe(spoken);
});

test("play after a move while paused reads from where the reader is", async ({ page }) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	await pause(page);
	await move(page, "scroll");
	const read = await reader.lastSavedWord(page);

	const starts = await page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0);
	await page.getByRole("button", { name: "Resume listening" }).click();
	await expect
		.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0))
		.toBe(starts + 1);
	// Three words, so the pause has a word to save that isn't the one already saved.
	await speak(page, 3);

	expect(await pause(page), "the voice started at the reader's word").toBe(read + 2);
});

test("paused, a wheel and a leave before the scroll comes to rest reopen on the scrolled spot", async ({
	page,
}) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	const spoken = await pause(page);
	const settles = await reader.settleCount(page);
	await reader.blurFocusedControl(page);
	const box = await page.locator(".reader-scroll-content").boundingBox();
	if (!box) throw new Error("No reader scroller");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

	// Real input, then gone before the settle: the flush carries the position.
	await page.mouse.wheel(0, 1500);
	// The scroll's ticks, well inside the 150ms scroll-end debounce.
	await page.waitForTimeout(60);
	const id = await reader.leaveFlushed(page);

	expect(await reader.settleCount(page), "left before a settle").toBe(settles);
	const saved = (await reader.savedRow(page, id))?.wordPosition ?? 0;
	expect(saved).toBeGreaterThan(spoken);
	await openBookFromLibrary(page, "Big Book");
	await expect.poll(() => reader.scrollModeTopWord(page), { timeout: 10_000 }).toBe(saved);
});

test("paused after looking away while it played, the spoken word is saved and the view browses; play from the player leaves browse and saves again", async ({
	page,
}) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	await move(page, "scroll");
	await speak(page, 3);

	const spoken = await pause(page);

	expect(await savedWord(page)).toBe(spoken);
	await expect(reader.browseBar(page)).toBeVisible();

	const starts = await page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0);
	await page.getByRole("button", { name: "Resume listening" }).click();
	await expect
		.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0))
		.toBe(starts + 1);
	await expect(reader.browseBar(page)).toBeHidden();
	await speak(page, 3);
	const resumed = await pause(page);
	expect(resumed, "saves land again").not.toBe(spoken);
	expect(await savedWord(page)).toBe(resumed);
});

test("paused, a fast long scroll is saved as reading and doesn't enter browse", async ({
	page,
}) => {
	// Long enough for a fast scroll to cover the distance that enters browse.
	await openListening(page, "scroll", { paragraphs: 400 });
	await speak(page, 30);
	await pause(page);

	// Fast and far, as in browse-mode's own case: without read-aloud this browses.
	for (let i = 0; i < 4; i++) {
		await reader.wheel(page, 3000);
		await page.waitForTimeout(400);
	}
	await reader.waitPositionQuiet(page);

	await expect(reader.browseBar(page)).toBeHidden();
	expect(await savedWord(page)).toBe(await reader.lastSavedWord(page));
	expect(
		await page.evaluate(() => window.__lesefluss_e2e_saveLog?.at(-1)?.source),
		"saved as the reader's settle",
	).toBe("settle");
});

test("paused, a word tap moves only the reader: it is saved and the voice stays paused", async ({
	page,
}) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	await pause(page);
	const starts = await page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0);
	const tapped = page.locator(".reader-scroll-content span[data-word]").nth(80);
	const word = Number(await tapped.getAttribute("data-word"));

	await tapped.click();
	await reader.waitPositionQuiet(page);

	expect(await savedWord(page)).toBe(word);
	expect(await page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0)).toBe(starts);
	await expect(page.getByRole("button", { name: "Resume listening" })).toBeVisible();
});

test("paused, stepping RSVP words is saved as reading", async ({ page }) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	const spoken = await pause(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });

	await reader.blurFocusedControl(page);
	for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
	await reader.waitPositionQuiet(page);

	expect(await savedWord(page)).toBeGreaterThan(spoken);
});

const bySystem = (page: Page, playing: boolean) =>
	page.evaluate((playing) => window.__lesefluss_e2e_tts?.setPlayingBySystem(playing), playing);
const sessionStarts = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0);

test("paused by the system after a glance away, a system resume carries on with the voice, out of browse, and is saved", async ({
	page,
}) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	await move(page, "scroll");
	await speak(page, 3);

	// Earbuds out, then back in.
	await bySystem(page, false);
	await expect(reader.browseBar(page)).toBeVisible();
	const spokenAtPause = await reader.lastSavedWord(page);
	const starts = await sessionStarts(page);
	await bySystem(page, true);

	await expect(reader.browseBar(page)).toBeHidden();
	await speak(page, 3);
	const listened = await pause(page);
	expect(await sessionStarts(page), "the same session carried on").toBe(starts);
	expect(listened, "on from where the voice paused").toBe(spokenAtPause + 3);
	expect(await savedWord(page)).toBe(listened);
});

test("paused, moved by the reader, then resumed by the system, reads from where the reader is", async ({
	page,
}) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	await pause(page);
	await move(page, "scroll");
	const read = await reader.lastSavedWord(page);
	const starts = await sessionStarts(page);

	await bySystem(page, true);

	await expect.poll(() => sessionStarts(page)).toBe(starts + 1);
	await speak(page, 3);
	expect(await pause(page), "the voice started at the reader's word").toBe(read + 2);
});

test("paused while looking away, reading on by eye at the browsed spot commits it as without read-aloud", async ({
	page,
}) => {
	// Fakes the clock, so the two-minute resume rule costs no wall time.
	await page.clock.install();
	await openListening(page, "scroll");
	await speak(page, 30);
	await move(page, "scroll");
	await speak(page, 3);
	const spoken = await pause(page);
	await expect(reader.browseBar(page)).toBeVisible();

	const toast = page.getByText(/Reading position moved to \d+%/);
	for (let i = 0; i < 8 && !(await toast.isVisible()); i++) {
		await page.clock.fastForward(45_000);
		await reader.wheel(page, 150);
		await page.waitForTimeout(500);
	}

	await expect(toast).toBeVisible();
	await expect(reader.browseBar(page)).toBeHidden();
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page)).toBeGreaterThan(spoken);
});

test("paused while looking away, a glance at the browsed spot saves nothing", async ({ page }) => {
	await openListening(page, "scroll");
	await speak(page, 30);
	await move(page, "scroll");
	await speak(page, 3);
	const spoken = await pause(page);

	await reader.wheel(page, 150);
	await page.waitForTimeout(500);
	await reader.wheel(page, 150);
	await reader.waitPositionQuiet(page);

	await expect(reader.browseBar(page)).toBeVisible();
	expect(await savedWord(page)).toBe(spoken);
});
