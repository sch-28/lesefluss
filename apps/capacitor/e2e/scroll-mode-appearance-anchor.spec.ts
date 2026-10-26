import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import type { SyncSettings } from "@lesefluss/core";
import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Layout settings reflow the scroll reader's paragraphs, and the virtual list
 * shifts the scroll offset while it re-measures them. The reader has to keep
 * the line holding its word at the top and save nothing, whether the change is
 * made here or pulled in by sync. A reflow usually moves the word off the start
 * of its line, so the line, not the word itself, is what stays on top.
 *
 * Two widths: a phone, where narrow lines wrap a lot, and a desktop window,
 * where the column hits its max width and a half-cut top line went unnoticed.
 */
const PHONE = { width: 420, height: 900 };
const WIDE = { width: 1100, height: 1000 };

/** Past the reflow, the re-anchor going quiet and the scroll-end debounce. */
const REFLOW_SETTLE_MS = 2000;

type Change = { name: string; apply: (page: Page) => Promise<void> };

async function clickInAppearance(page: Page, click: (page: Page) => Promise<void>) {
	await reader.openAppearance(page);
	await click(page);
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
}

const CHANGES: Change[] = [
	{
		name: "font size",
		apply: async (page) => {
			await reader.increaseFontSize(page);
			await reader.increaseFontSize(page);
		},
	},
	{
		name: "line spacing",
		apply: async (page) => {
			for (let i = 0; i < 5; i++) await reader.increaseLineSpacing(page);
		},
	},
	{
		name: "font family",
		apply: (page) =>
			clickInAppearance(page, (p) => p.getByRole("radio", { name: "Serif" }).click()),
	},
	{
		name: "bundled font",
		apply: (page) =>
			clickInAppearance(page, (p) => p.getByRole("radio", { name: "OpenDyslexic" }).click()),
	},
	{
		// Through sync, not the popover: opening it loads the font picker's faces.
		name: "bold text",
		apply: (page) => applyRemoteSettings(page, { readerBold: true }),
	},
	{
		name: "margins",
		apply: async (page) => {
			for (let i = 0; i < 3; i++) await reader.stepUpAppearance(page, "Margins");
		},
	},
	{
		name: "letter spacing",
		apply: async (page) => {
			for (let i = 0; i < 4; i++) await reader.stepUpAppearance(page, "Letter spacing");
		},
	},
	{
		name: "word spacing",
		apply: async (page) => {
			for (let i = 0; i < 4; i++) await reader.stepUpAppearance(page, "Word spacing");
		},
	},
	{
		name: "paragraph spacing",
		apply: async (page) => {
			for (let i = 0; i < 5; i++) await reader.stepUpAppearance(page, "Paragraph spacing");
		},
	},
];

async function applyRemoteSettings(page: Page, patch: Partial<SyncSettings>) {
	await page.evaluate((patch) => {
		const apply = window.__lesefluss_e2e_applyRemoteSettings;
		if (!apply) throw new Error("No __lesefluss_e2e_applyRemoteSettings hook");
		return apply(patch);
	}, patch);
}

/** The computed style of a rendered word, to prove a change really reached the text. */
async function wordStyle(page: Page): Promise<string> {
	return page.evaluate(() => {
		const span = document.querySelector("span[data-word]");
		if (!span) return "";
		const style = getComputedStyle(span);
		return `${style.fontSize}|${style.fontFamily}`;
	});
}

async function openMidChapter(page: Page, viewport: { width: number; height: number }) {
	await page.setViewportSize(viewport);
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);

	const savePending = reader.waitForNextSave(page);
	await reader.wheel(page, 2500);
	await savePending;
	const word = await reader.scrollModeTopWord(page);
	expect(await reader.lastSavedWord(page)).toBe(word);
	return word;
}

/** How `word` and its paragraph are laid out; changes whenever the text rewraps. */
async function layoutOf(page: Page, word: number): Promise<string> {
	return page.evaluate((word) => {
		const span = document.querySelector<HTMLElement>(`span[data-word="${word}"]`);
		if (!span) return "unmounted";
		const r = span.getBoundingClientRect();
		const block = span.closest("p, div") as HTMLElement | null;
		const gap = block ? getComputedStyle(block).marginBottom : "";
		// Word spacing can leave every line break in place; the next word still moves.
		const next = document.querySelector(`span[data-word="${word + 1}"]`)?.getBoundingClientRect();
		return `${Math.round(r.left)}|${Math.round(r.height)}|${block?.offsetHeight ?? 0}|${gap}|${Math.round(next?.left ?? 0)}`;
	}, word);
}

/**
 * At the top edge, never above it: the settle rule would skip a line the edge
 * cuts. A few pixels below is the scroll offset rounding to whole pixels.
 */
const onTopEdge = (offset: number) => (offset >= 0 && offset < 4 ? "on top" : offset);

/** Lands there, and is still there once anything left to re-measure has had time to move it. */
async function expectOnTop(read: () => Promise<number>) {
	await expect.poll(async () => onTopEdge(await read()), { timeout: 10_000 }).toBe("on top");
	await new Promise((resolve) => setTimeout(resolve, 1000));
	expect(onTopEdge(await read())).toBe("on top");
}

const expectLineOnTop = (page: Page, word: number) =>
	expectOnTop(() => reader.wordLineOffsetFromTop(page, word));

/**
 * Checks the saved word before the count, so a failure shows which word was
 * saved. `saves` is a save-request count: a write decided now but committed
 * late still counts.
 */
async function expectNoNewSave(page: Page, word: number, saves: number) {
	expect(await reader.lastSavedWord(page)).toBe(word);
	expect(await reader.saveRequestCount(page)).toBe(saves);
}

async function expectAnchoredWithoutSave(page: Page, word: number, saves: number) {
	await page.waitForTimeout(REFLOW_SETTLE_MS);
	await expectLineOnTop(page, word);
	await expectNoNewSave(page, word, saves);
}

/** Leaves through in-app back, which runs the reader's unmount flush. */
async function leaveToLibrary(page: Page) {
	// The unmount flush has committed: no late save lands in a later check.
	await reader.leaveFlushed(page);
}

async function expectReopensAt(page: Page, title: string, word: number, saves: number) {
	await expectNoNewSave(page, word, saves);
	await leaveToLibrary(page);
	expect(await reader.lastSavedWord(page)).toBe(word);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await expectLineOnTop(page, word);
}

for (const [size, viewport] of [
	["phone", PHONE],
	["wide", WIDE],
] as const) {
	for (const change of CHANGES) {
		test(`${change.name} on a ${size} screen keeps the reading line on top and saves nothing`, async ({
			page,
		}) => {
			const word = await openMidChapter(page, viewport);
			const saves = await reader.saveRequestCount(page);
			const before = await layoutOf(page, word);

			await change.apply(page);

			await expect.poll(() => layoutOf(page, word)).not.toBe(before);
			await expectAnchoredWithoutSave(page, word, saves);
			await expectReopensAt(page, BIG_BOOK_TITLE, word, saves);
		});
	}
}

test("rapid font size taps keep the reading line on top and save nothing", async ({ page }) => {
	const word = await openMidChapter(page, WIDE);
	const saves = await reader.saveRequestCount(page);
	const before = await layoutOf(page, word);

	await clickInAppearance(page, async (p) => {
		const plus = p.getByRole("button", { name: "Increase Size" });
		for (let i = 0; i < 3; i++) {
			await plus.click();
			// Faster than a reflow settles: each tap lands mid-reflow.
			await p.waitForTimeout(60);
		}
	});

	await expect.poll(() => layoutOf(page, word)).not.toBe(before);
	await expectAnchoredWithoutSave(page, word, saves);
	await expectReopensAt(page, BIG_BOOK_TITLE, word, saves);
});

test("a spacing change pulled in by sync keeps the reading line on top", async ({ page }) => {
	const word = await openMidChapter(page, PHONE);
	const saves = await reader.saveRequestCount(page);
	const before = await layoutOf(page, word);

	await applyRemoteSettings(page, {
		readerLetterSpacing: 0.1,
		readerWordSpacing: 0.3,
		readerParagraphSpacing: 2,
	});

	await expect.poll(() => layoutOf(page, word)).not.toBe(before);
	await expectAnchoredWithoutSave(page, word, saves);
	await expectReopensAt(page, BIG_BOOK_TITLE, word, saves);
});

test("a font change pulled in by sync keeps the reading line on top", async ({ page }) => {
	const word = await openMidChapter(page, PHONE);
	const saves = await reader.saveRequestCount(page);

	await applyRemoteSettings(page, { readerFontSize: 24, readerFontFamily: "serif" });

	await expect.poll(() => wordStyle(page)).toMatch(/^24px\|Georgia/);
	await expectAnchoredWithoutSave(page, word, saves);
	await expectReopensAt(page, BIG_BOOK_TITLE, word, saves);
});

test("a narrower window keeps the reading line on top", async ({ page }) => {
	const word = await openMidChapter(page, PHONE);
	const saves = await reader.saveRequestCount(page);
	const before = await layoutOf(page, word);

	await page.setViewportSize({ width: 320, height: PHONE.height });

	await expect.poll(() => layoutOf(page, word)).not.toBe(before);
	await expectAnchoredWithoutSave(page, word, saves);
});

test("a change arriving while a reopened book is still landing keeps the line, then scrolling saves", async ({
	page,
}) => {
	const word = await openMidChapter(page, PHONE);
	await leaveToLibrary(page);
	const saves = await reader.saveRequestCount(page);

	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await applyRemoteSettings(page, { readerFontSize: 24 });

	await expect.poll(() => wordStyle(page)).toMatch(/^24px\|/);
	await expectAnchoredWithoutSave(page, word, saves);
	// The re-anchor must hand the next real scroll its save, not swallow it.
	const savePending = reader.waitForNextSave(page);
	await reader.wheel(page, 300);
	await savePending;
	expect(await reader.lastSavedWord(page)).toBe(await reader.scrollModeTopWord(page));
});

for (const [when, delayMs] of [
	["right after", 200],
	["well after", REFLOW_SETTLE_MS],
] as const) {
	test(`scrolling ${when} a font change saves the new top word`, async ({ page }) => {
		const word = await openMidChapter(page, PHONE);
		let clickedAt = 0;
		await clickInAppearance(page, async (p) => {
			await p.getByRole("button", { name: "Increase Size" }).click();
			clickedAt = Date.now();
		});
		// The case's own timing: a scroll that comes this long after the change.
		await page.waitForTimeout(Math.max(0, clickedAt + delayMs - Date.now()));

		const savePending = reader.waitForNextSave(page);
		await reader.wheel(page, 800);
		await savePending;
		await page.waitForTimeout(REFLOW_SETTLE_MS);

		const top = await reader.scrollModeTopWord(page);
		expect(top).toBeGreaterThan(word);
		expect(await reader.lastSavedWord(page)).toBe(top);
	});
}

/**
 * Chapter titles are paragraphs without word spans, and re-measure by more than
 * body text when the font changes. A TOC jump to chapter 2 commits the title's
 * first word.
 */
test("a font change next to a chapter break keeps the reading line on top and saves nothing", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await reader.waitPastJumpGuard(page);
	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;
	// Read from here's own settle may still be on its way.
	await reader.waitPastJumpGuard(page);
	const word = await reader.lastSavedWord(page);
	const saves = await reader.saveRequestCount(page);

	await reader.increaseFontSize(page);
	await reader.increaseFontSize(page);

	await expectAnchoredWithoutSave(page, word, saves);
	await expectReopensAt(page, title, word, saves);
});

const LONG_TITLE = "Long Paragraphs";

/** Paragraphs many lines long, so a settle lands mid-paragraph rather than on a start. */
function longParagraphsFixture(): EpubFixture {
	const words = (n: number) => Array.from({ length: 160 }, (_, i) => `word${n}x${i}`).join(" ");
	const body = Array.from({ length: 40 }, (_, n) => `<p>${words(n)}</p>`).join("");
	return {
		title: LONG_TITLE,
		chapters: [{ id: "c1", href: "c1.htm", body }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

/** Wheels like a mouse, a few notches, and waits the settle out instead of reacting to the save. */
async function settleMidParagraph(page: Page): Promise<number> {
	for (let i = 0; i < 3; i++) {
		await reader.wheel(page, 100);
		await page.waitForTimeout(80);
	}
	await page.waitForTimeout(reader.LIST_SETTLE_MS + 1500);
	const word = await reader.lastSavedWord(page);
	const paragraphStart = await page.evaluate(
		(word) =>
			document
				.querySelector(`span[data-word="${word}"]`)
				?.closest("p")
				?.querySelector("span[data-word]")
				?.getAttribute("data-word"),
		word,
	);
	expect(paragraphStart).not.toBe(String(word));
	return word;
}

for (const [size, viewport] of [
	["phone", PHONE],
	["wide", WIDE],
] as const) {
	test(`a font size step down after a mid-paragraph settle on a ${size} screen keeps that word`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await seedFixture(page, longParagraphsFixture(), "long.epub");
		await openBookFromLibrary(page, LONG_TITLE);
		await reader.expectLoaded(page);
		await reader.waitOpenSettled(page);
		await reader.wheel(page, 3000);
		const word = await settleMidParagraph(page);
		const saves = await reader.saveRequestCount(page);

		await clickInAppearance(page, (p) => p.getByRole("button", { name: "Decrease Size" }).click());

		await expectAnchoredWithoutSave(page, word, saves);
		await expectReopensAt(page, LONG_TITLE, word, saves);
	});
}

test("after a fresh load with custom reader settings, a step down keeps the settled word", async ({
	page,
}) => {
	await page.setViewportSize(WIDE);
	await seedFixture(page, longParagraphsFixture(), "long.epub");
	await applyRemoteSettings(page, {
		readerFontFamily: "serif",
		readerLineSpacing: 2,
		readerMargin: 28,
		readerFontSize: 28,
	});
	await openBookFromLibrary(page, LONG_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.wheel(page, 3000);
	await settleMidParagraph(page);
	await page.reload();
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);

	const word = await settleMidParagraph(page);
	const saves = await reader.saveRequestCount(page);

	await clickInAppearance(page, (p) => p.getByRole("button", { name: "Decrease Size" }).click());

	await expectAnchoredWithoutSave(page, word, saves);
});
