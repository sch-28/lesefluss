import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, bigBookFixture, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A position from another device reaches the open book (a sync pull, a device).
 * A reader that hasn't moved since it last took a position from the row moves
 * there (with Undo); one that moved, or is playing RSVP or the voice, keeps its
 * own (with Go there). No flush ever writes an older word back over a newer one.
 */

const ADOPTED = "Moved to where you left off on another device";
const KEPT = "Newer position from another device";

/** Opens the big book without moving in it. */
async function openIdle(page: Page) {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const id = reader.bookIdFromUrl(page);
	return { id, start: (await savedRow(page, id)).wordPosition };
}

/** Opens the big book and moves in it; returns the book id and the saved word. */
async function openAndRead(page: Page) {
	const { id } = await openIdle(page);
	await scrollAndSave(page);
	return { id, saved: await reader.lastSavedWord(page) };
}

async function scrollAndSave(page: Page) {
	const saves = await reader.saveCount(page);
	await reader.wheel(page, 1200);
	await reader.waitForSaveAbove(page, saves, 5000);
	await reader.waitPositionQuiet(page);
}

type PullOptions = { invalidate?: boolean; applyAfterNextSave?: boolean };

/** Lands `word` from another device the way a pull does; returns its revision. */
async function pullFromAnotherDevice(page: Page, id: string, word: number, options?: PullOptions) {
	return page.evaluate(
		async ({ id, word, options }) => {
			const pull = window.__lesefluss_e2e_remotePosition;
			if (!pull) throw new Error("No __lesefluss_e2e_remotePosition hook (DEV build?)");
			const rev = Date.now();
			await pull(id, word, rev, options);
			return rev;
		},
		{ id, word, options },
	);
}

async function setVisibility(page: Page, state: "hidden" | "visible") {
	await page.evaluate((state) => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
		Object.defineProperty(document, "hidden", {
			configurable: true,
			get: () => state === "hidden",
		});
		document.dispatchEvent(new Event("visibilitychange"));
	}, state);
}

async function savedRow(page: Page, id: string) {
	const row = await reader.savedRow(page, id);
	if (!row) throw new Error(`No row for ${id}`);
	return row;
}

/** The line holding `word` sits on the reader's top edge. */
async function expectOnTop(page: Page, word: number) {
	await expect
		.poll(async () => Math.abs(await reader.wordLineOffsetFromTop(page, word)) < 6)
		.toBe(true);
}

for (const leave of ["visibility", "back"] as const) {
	test(`a reader that hasn't moved goes to a newer position from another device, and its ${leave} flush writes nothing`, async ({
		page,
	}) => {
		const { id, start } = await openIdle(page);
		const theirs = start + 400;

		const rev = await pullFromAnotherDevice(page, id, theirs);

		await expect(page.getByText(ADOPTED)).toBeVisible();
		await expectOnTop(page, theirs);
		if (leave === "visibility") {
			await setVisibility(page, "hidden");
			await reader.waitPositionQuiet(page);
			await setVisibility(page, "visible");
			expect(await reader.getPendingPosition(page, id)).toBeNull();
		} else await reader.leaveFlushed(page);
		expect(await savedRow(page, id), "the pull's row, untouched").toMatchObject({
			wordPosition: theirs,
			updatedAt: rev,
		});
	});
}

test("Undo goes back to where the reader was before the first of two adopts, and the second replaces the toast", async ({
	page,
}) => {
	const { id, start } = await openIdle(page);

	await pullFromAnotherDevice(page, id, start + 400);
	await expect(page.getByText(ADOPTED)).toBeVisible();
	await pullFromAnotherDevice(page, id, start + 800);
	await expectOnTop(page, start + 800);
	await expect(page.getByText(ADOPTED)).toHaveCount(1);

	await page.getByRole("button", { name: "Undo" }).click();

	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(start);
});

test("moving on after an adopt ends its Undo", async ({ page }) => {
	const { id, start } = await openIdle(page);
	await pullFromAnotherDevice(page, id, start + 400);
	await expect(page.getByText(ADOPTED)).toBeVisible();
	await reader.waitPastJumpGuard(page);

	await scrollAndSave(page);

	await expect(page.getByText(ADOPTED)).toHaveCount(0);
});

test("RSVP paused after playing, the reader goes to the newer position", async ({ page }) => {
	const { id, start } = await openIdle(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(true);
	await page.waitForTimeout(500);
	await reader.rsvpTogglePlay(page);
	await reader.waitPositionQuiet(page);
	const theirs = start + 800;

	await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(ADOPTED)).toBeVisible();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(theirs);
});

test("in page mode, a reader that hasn't moved turns to the newer position", async ({ page }) => {
	await openIdle(page);
	await reader.setPaginationStyle(page, "page");
	await reader.waitPositionQuiet(page);
	const id = reader.bookIdFromUrl(page);
	const theirs = (await savedRow(page, id)).wordPosition + 600;

	await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(ADOPTED)).toBeVisible();
	await reader.expectWordVisibleInPage(page, theirs);
});

test("a reader whose move has been saved goes to a newer position from another device", async ({
	page,
}) => {
	const { id, saved } = await openAndRead(page);
	const theirs = saved + 400;

	const rev = await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(ADOPTED)).toBeVisible();
	await expectOnTop(page, theirs);
	await reader.waitPositionQuiet(page);
	expect(await savedRow(page, id)).toMatchObject({ wordPosition: theirs, updatedAt: rev });
});

test("a reader that moved again since its save keeps its position, and Go there moves to the other device's", async ({
	page,
}) => {
	const { id, saved } = await openAndRead(page);
	const theirs = saved + 800;
	// Ticks of a scroll that hasn't come to rest, so isn't saved yet.
	await reader.wheel(page, 400);
	await page.waitForTimeout(60);

	const rev = await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(KEPT)).toBeVisible();
	await reader.waitPositionQuiet(page);
	const kept = await savedRow(page, id);
	expect(kept.wordPosition).toBeGreaterThan(saved);
	expect(kept.wordPosition).not.toBe(theirs);
	expect(kept.updatedAt).toBeGreaterThan(rev);

	await page.getByRole("button", { name: "Go there" }).click();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(theirs);
	await expectOnTop(page, theirs);
});

test("a reader playing RSVP writes its own word over the other device's, and Go there moves to it", async ({
	page,
}) => {
	const { id, start } = await openIdle(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(true);
	const theirs = start + 400;

	const rev = await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(KEPT)).toBeVisible();
	await reader.rsvpTogglePlay(page);
	await reader.waitPositionQuiet(page);
	const kept = await savedRow(page, id);
	expect(kept.updatedAt).toBeGreaterThan(rev);
	expect(kept.wordPosition).toBe(await reader.lastSavedWord(page));
	expect(kept.wordPosition).toBeLessThan(theirs);

	await page.getByRole("button", { name: "Go there" }).click();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(theirs);
});

test("browsing without having moved, the adopt moves only the spot Back returns to", async ({
	page,
}) => {
	const { id, start } = await openIdle(page);
	await reader.startBrowse(page);
	await reader.wheel(page, 1200);
	await reader.waitPositionQuiet(page);
	const browsed = await reader.scrollModeTopWord(page);
	const theirs = start + 800;

	await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(ADOPTED)).toBeVisible();
	expect(await reader.scrollModeTopWord(page), "the view stays where it browsed").toBe(browsed);
	expect((await savedRow(page, id)).wordPosition).toBe(theirs);
	await reader.browseBack(page);
	await expectOnTop(page, theirs);
});

test("a pull that read the row before the reader's own save still reaches the reader, which goes there", async ({
	page,
}) => {
	const { id, saved } = await openAndRead(page);
	const theirs = saved + 800;

	// A slow pull on resume: it reads the row, the reader saves, then it applies.
	const pull = pullFromAnotherDevice(page, id, theirs, { applyAfterNextSave: true });
	await scrollAndSave(page);
	await pull;

	await expect(page.getByText(ADOPTED)).toBeVisible();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(theirs);
});

test("a flush that finds a newer row it hadn't seen keeps the reader's word over it", async ({
	page,
}) => {
	const { id, saved } = await openAndRead(page);
	const theirs = saved + 800;
	// The row changes without the reader hearing: only its own next write finds out.
	const rev = await pullFromAnotherDevice(page, id, theirs, { invalidate: false });
	const ticks = await reader.saveRequestCount(page);
	await reader.wheel(page, 400);
	await page.waitForTimeout(60);

	await setVisibility(page, "hidden");
	await reader.waitPositionQuiet(page);
	await setVisibility(page, "visible");

	expect(await reader.saveRequestCount(page)).toBeGreaterThan(ticks);
	await expect(page.getByText(KEPT)).toBeVisible();
	const kept = await savedRow(page, id);
	expect(kept.wordPosition).not.toBe(theirs);
	expect(kept.updatedAt).toBeGreaterThan(rev);
});

test("a device position the reader follows shows no toast, and the reader's next move saves", async ({
	page,
}) => {
	const { id, saved } = await openAndRead(page);
	const deviceWord = saved + 300;

	await page.evaluate((word) => window.__lesefluss_e2e_devicePosition?.(word), deviceWord);
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(deviceWord);
	await scrollAndSave(page);

	await expect(page.getByText(ADOPTED)).toHaveCount(0);
	await expect(page.getByText(KEPT)).toHaveCount(0);
	expect((await savedRow(page, id)).wordPosition).toBe(await reader.lastSavedWord(page));
});

test("reopening a book read on this device shows no toast", async ({ page }) => {
	const { id, saved } = await openAndRead(page);
	await reader.leaveFlushed(page);

	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await page.waitForTimeout(500);

	await expect(page.getByText(ADOPTED)).toHaveCount(0);
	await expect(page.getByText(KEPT)).toHaveCount(0);
	expect((await savedRow(page, id)).wordPosition).toBe(saved);
});

/** Read-aloud on the DEV fake engine, which speaks only when told to. */
async function openListening(page: Page) {
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	const title = await seedFixture(page, bigBookFixture(), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await page.getByRole("button", { name: "Listen", exact: true }).click();
	await expect.poll(() => ttsStarts(page)).toBe(1);
	await page.evaluate(() => window.__lesefluss_e2e_tts?.speak(30));
	await reader.waitPositionQuiet(page);
	return reader.bookIdFromUrl(page);
}
const ttsStarts = (page: Page) => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0);

test("listening paused since, the reader goes to the newer position, and play reads from there", async ({
	page,
}) => {
	const id = await openListening(page);
	await page.getByRole("button", { name: "Pause listening" }).first().click();
	await reader.waitPositionQuiet(page);
	const theirs = (await savedRow(page, id)).wordPosition + 800;

	await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(ADOPTED)).toBeVisible();
	await page.getByRole("button", { name: "Stop listening" }).click();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition, "stop saved no spoken word over it").toBe(theirs);
});

test("listening, the voice keeps its position, and Go there moves the voice", async ({ page }) => {
	const id = await openListening(page);
	const theirs = (await savedRow(page, id)).wordPosition + 800;
	const starts = await ttsStarts(page);

	const rev = await pullFromAnotherDevice(page, id, theirs);

	await expect(page.getByText(KEPT)).toBeVisible();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).updatedAt).toBeGreaterThan(rev);

	await page.getByRole("button", { name: "Go there" }).click();
	await expect.poll(() => ttsStarts(page), "the voice restarted there").toBe(starts + 1);
	await page.evaluate(() => window.__lesefluss_e2e_tts?.speak(3));
	await page.getByRole("button", { name: "Pause listening" }).first().click();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBeGreaterThanOrEqual(theirs);
});

test("stopped after looking away, a pull skipped for the voice's save keeps the spoken word, not the browsed one", async ({
	page,
}) => {
	const id = await openListening(page);
	const settles = await reader.settleCount(page);
	await reader.wheel(page, 1200);
	await reader.waitForSettleAbove(page, settles);
	await page.evaluate(() => window.__lesefluss_e2e_tts?.speak(3));
	const theirs = (await savedRow(page, id)).wordPosition + 800;

	const pull = pullFromAnotherDevice(page, id, theirs, { applyAfterNextSave: true });
	await page.getByRole("button", { name: "Stop listening" }).click();
	await pull;

	await expect(page.getByText(KEPT)).toBeVisible();
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.waitPositionQuiet(page);
	const spoken = await page.evaluate(
		() => window.__lesefluss_e2e_saveLog?.filter((s) => s.source === "read-aloud").at(-1)?.word,
	);
	expect((await savedRow(page, id)).wordPosition, "the spoken word, the spot Back returns to").toBe(
		spoken,
	);

	await page.getByRole("button", { name: "Go there" }).click();
	await reader.waitPositionQuiet(page);
	expect((await savedRow(page, id)).wordPosition).toBe(theirs);
	await reader.browseBack(page);
	await expectOnTop(page, theirs);
});
