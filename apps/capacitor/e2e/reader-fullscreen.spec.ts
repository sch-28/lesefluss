import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Fullscreen in the web reader: F enters and leaves, the reader bar hides and
 * slides in at the top edge, and the change of size never moves or saves the
 * position. A fullscreen exit while RSVP plays pauses it; the Escape that came
 * with the exit never also leaves RSVP.
 */

const bar = (page: Page) => page.getByTestId("reader-bar");
const isFullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement != null);

async function pressKey(page: Page, key: string) {
	await reader.blurFocusedControl(page);
	await page.keyboard.press(key);
}

/** What the browser's own control (or its Esc) does: an exit the page did not start. */
const browserExit = (page: Page) => page.evaluate(() => document.exitFullscreen());

/** An Esc exit in a browser that also hands the page the keydown, right after the exit it caused. */
const browserEscExit = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				document.addEventListener(
					"fullscreenchange",
					() => {
						document.body.dispatchEvent(
							new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
						);
						resolve();
					},
					{ once: true },
				);
				void document.exitFullscreen();
			}),
	);

async function openNovel(page: Page) {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
}

test("F goes fullscreen with the bar hidden until the pointer reaches the top edge, and F leaves", async ({
	page,
}) => {
	await openNovel(page);
	await expect(bar(page)).toBeInViewport();

	await pressKey(page, "f");
	await expect.poll(() => isFullscreen(page)).toBe(true);
	await expect(bar(page)).not.toBeInViewport();

	await page.getByTestId("fullscreen-reveal-zone").hover();
	await expect(bar(page)).toBeInViewport();
	await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();

	const viewport = page.viewportSize();
	await page.mouse.move((viewport?.width ?? 800) / 2, (viewport?.height ?? 600) / 2);
	await expect(bar(page)).not.toBeInViewport({ timeout: 5000 });

	await pressKey(page, "f");
	await expect.poll(() => isFullscreen(page)).toBe(false);
	await expect(bar(page)).toBeInViewport();
});

for (const mode of ["scroll", "page"] as const) {
	test(`${mode}: entering and leaving fullscreen keeps the words on screen and saves nothing`, async ({
		page,
	}) => {
		await openNovel(page);
		const bookId = reader.bookIdFromUrl(page);
		if (mode === "page") {
			await reader.setPaginationStyle(page, "page");
			await reader.turnPages(page, 3);
		} else {
			const saved = reader.waitForNextSave(page);
			await reader.wheel(page, 2400);
			await saved;
		}
		await reader.waitPositionQuiet(page);
		const firstWord = () =>
			mode === "page" ? reader.pageModeFirstVisibleWord(page) : reader.scrollModeTopWord(page);
		const before = await firstWord();
		const stored = (await reader.savedRow(page, bookId))?.wordPosition;

		// Page mode repaginates to the new height: the page may start earlier, but it holds the word.
		const expectOnScreen = async () => {
			if (mode === "page") expect(await reader.pageModeVisibleWords(page)).toContain(before);
			else expect(await firstWord()).toBe(before);
		};

		await reader.expectNoSaveDuring(page, async () => {
			await pressKey(page, "f");
			await expect.poll(() => isFullscreen(page)).toBe(true);
		});
		await expectOnScreen();

		await reader.expectNoSaveDuring(page, async () => {
			await browserExit(page);
			await expect.poll(() => isFullscreen(page)).toBe(false);
		});
		await expectOnScreen();
		expect((await reader.savedRow(page, bookId))?.wordPosition).toBe(stored);
	});
}

test("RSVP: the Escape that leaves fullscreen pauses RSVP and stays in it; Space resumes, the next Escape leaves RSVP", async ({
	page,
}) => {
	await openNovel(page);
	await reader.toggleRsvp(page);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(true);

	await pressKey(page, "f");
	await expect.poll(() => isFullscreen(page)).toBe(true);
	expect(await reader.rsvpIsPlaying(page)).toBe(true);

	await browserEscExit(page);
	await expect.poll(() => isFullscreen(page)).toBe(false);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(false);
	await expect(page.locator(".rsvp-display")).toBeVisible();
	// A real next press comes long after the window in which an Escape still belongs to the exit.
	await page.waitForTimeout(200);

	await pressKey(page, " ");
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(true);

	await pressKey(page, "Escape");
	await expect(page.locator(".rsvp-display")).toHaveCount(0);
});

test("RSVP: the browser's own exit, with no key, pauses RSVP too", async ({ page }) => {
	await openNovel(page);
	await reader.toggleRsvp(page);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(true);
	await pressKey(page, "f");
	await expect.poll(() => isFullscreen(page)).toBe(true);

	await browserExit(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(false);
	await expect(page.locator(".rsvp-display")).toBeVisible();
});
