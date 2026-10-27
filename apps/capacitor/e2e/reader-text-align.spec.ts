import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { expect, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { applyRemoteSettings } from "./helpers/remote-settings";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const paragraphAlign = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector(".reader-paragraph");
		return p ? getComputedStyle(p).textAlign : "";
	});

/** How the first paragraph wraps: its alignment, hyphenation and the language it hyphenates in. */
const paragraphText = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector(".reader-paragraph");
		if (!p) return null;
		const style = getComputedStyle(p);
		return {
			align: style.textAlign,
			hyphens: style.hyphens,
			lang: p.closest(".reader-scroll-content, [data-chunk-index]")?.getAttribute("lang"),
		};
	});

async function openGermanBook(page: Page) {
	await seedFixture(page, { ...plainBookFixture(), language: "de" }, "plain.epub");
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
}

test("justified text hyphenates in the book's language", async ({ page }) => {
	await openGermanBook(page);

	await applyRemoteSettings(page, { readerTextAlign: "justify" });

	await expect
		.poll(() => paragraphText(page))
		.toEqual({ align: "justify", hyphens: "auto", lang: "de" });
});

test("left-aligned text breaks only between words", async ({ page }) => {
	await openGermanBook(page);

	expect(await paragraphText(page)).toEqual({ align: "start", hyphens: "manual", lang: "de" });
});

for (const mode of ["scroll", "page"] as const) {
	test(`${mode}: justify falls back to left where a line is too short, and the switch saves nothing`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await seedFixture(page, plainBookFixture(), "plain.epub");
		await applyRemoteSettings(page, { readerTextAlign: "justify" });
		await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
		await reader.expectLoaded(page);
		await reader.waitOpenSettled(page);
		if (mode === "page") await reader.setPaginationStyle(page, "page");
		await expect.poll(async () => (await paragraphText(page))?.align).toBe("justify");
		await reader.waitPositionQuiet(page);
		const saves = await reader.saveRequestCount(page);

		await applyRemoteSettings(page, {
			readerFontSize: SETTING_CONSTRAINTS.READER_FONT_SIZE.max,
			readerMargin: SETTING_CONSTRAINTS.READER_MARGIN.max,
		});

		await expect
			.poll(() => paragraphText(page))
			.toMatchObject({ align: "start", hyphens: "manual" });
		await reader.waitPositionQuiet(page);
		expect(await reader.saveRequestCount(page), "the layout change saves nothing").toBe(saves);
	});
}

test.describe("page mode", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 420, height: 900 });
		await seedFixture(page, plainBookFixture(), "plain.epub");
		await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
		await reader.expectLoaded(page);
		await reader.setPaginationStyle(page, "page");
		await reader.turnPages(page, 5);
	});

	const TOGGLES: { name: string; justify: (page: Page) => Promise<void> }[] = [
		{
			name: "pulled in by sync",
			justify: (page) => applyRemoteSettings(page, { readerTextAlign: "justify" }),
		},
		{
			name: "from the popover",
			justify: async (page) => {
				await reader.openAppearance(page);
				await page.getByRole("radio", { name: "Justify" }).click();
				await page.keyboard.press("Escape");
				await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
			},
		},
	];

	for (const { name, justify } of TOGGLES) {
		test(`justify ${name} keeps the current word on screen, saves nothing, and reopens there`, async ({
			page,
		}) => {
			const word = await reader.pageModeFirstVisibleWord(page);
			await reader.waitPositionQuiet(page);
			const saves = await reader.saveRequestCount(page);

			await justify(page);

			await expect.poll(() => paragraphAlign(page)).toBe("justify");
			await reader.expectWordVisibleInPage(page, word);
			await reader.waitPositionQuiet(page);
			expect(await reader.saveRequestCount(page), "a layout change saves nothing").toBe(saves);
			expect(await reader.lastSavedWord(page)).toBe(word);

			await reader.leaveFlushed(page);
			await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
			await reader.expectLoaded(page);
			expect(await paragraphAlign(page)).toBe("justify");
			await reader.expectWordVisibleInPage(page, word);
		});
	}
});

// Long words that hyphenate in English: in a phone column several land at a line end.
const HYPHENATABLE = [
	"internationalization",
	"responsibilities",
	"characteristically",
	"incomprehensibility",
	"telecommunications",
	"disproportionately",
	"counterproductive",
	"institutionalization",
	"uncharacteristically",
	"interdisciplinary",
	"misunderstandings",
	"electromagnetically",
];

function hyphenatedFixture(): EpubFixture {
	const text = [...HYPHENATABLE, ...HYPHENATABLE].join(" and ");
	return {
		title: "Hyphenated",
		chapters: [{ id: "c1", href: "c1.htm", body: `<p>${text}</p><p>${text}</p>` }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

type Box = { left: number; right: number; top: number; bottom: number };

/** A word on screen whose hyphen split starts mid-line, with its line fragments. */
const findSplitWord = (page: Page) =>
	page.evaluate(() => {
		const onScreen = (r: DOMRect) =>
			r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
		for (const span of document.querySelectorAll<HTMLElement>("span[data-word]")) {
			const rects = [...span.getClientRects()];
			const line = span.closest(".reader-paragraph")?.getBoundingClientRect();
			const [head, tail] = [rects[0], rects[rects.length - 1]];
			if (!head || !line || head.left < line.left + 20 || tail.top <= head.top) continue;
			if (!onScreen(head) || !onScreen(tail)) continue;
			return {
				word: Number(span.dataset.word),
				fragments: rects.map((r) => ({
					left: r.left,
					right: r.right,
					top: r.top,
					bottom: r.bottom,
				})),
			};
		}
		return null;
	});

const centreOfWord = (page: Page, word: number) =>
	page.evaluate((word) => {
		const r = document.querySelector(`span[data-word="${word}"]`)?.getClientRects()[0];
		if (!r) throw new Error(`Word ${word} not rendered`);
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}, word);

const centreOf = (box: Box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

const handleBar = (page: Page, which: "start" | "end") =>
	page.locator(`.selection-handle--${which}`).evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { centre: r.left + r.width / 2, top: r.top };
	});

async function openSplitWord(page: Page, mode: "scroll" | "page") {
	await page.setViewportSize({ width: 360, height: 800 });
	await seedFixture(page, hyphenatedFixture(), "hyphenated.epub");
	await applyRemoteSettings(page, { readerTextAlign: "justify" });
	await openBookFromLibrary(page, "Hyphenated");
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	if (mode === "page") await reader.setPaginationStyle(page, "page");
	await reader.waitPositionQuiet(page);
	const split = await findSplitWord(page);
	if (!split) throw new Error("No word hyphenated across lines");
	return {
		word: split.word,
		first: split.fragments[0],
		last: split.fragments[split.fragments.length - 1],
	};
}

for (const mode of ["scroll", "page"] as const) {
	test(`${mode}: a selection ending on a hyphen-split word puts its handle on the last fragment`, async ({
		page,
	}) => {
		const { word, first, last } = await openSplitWord(page, mode);

		await reader.touchLongPressBetween(page, await centreOfWord(page, word - 1), centreOf(last));

		await expect(page.locator(".selection-handle--end")).toBeVisible();
		const end = await handleBar(page, "end");
		expect(Math.abs(end.centre - last.right), "on the last fragment's right edge").toBeLessThan(2);
		expect(end.top, "on the last fragment's line").toBeGreaterThan(first.top + 1);
	});

	test(`${mode}: a selection starting on a hyphen-split word puts its handle on the first fragment`, async ({
		page,
	}) => {
		const { word, first, last } = await openSplitWord(page, mode);

		await reader.touchLongPressBetween(page, centreOf(first), await centreOfWord(page, word + 1));

		await expect(page.locator(".selection-handle--start")).toBeVisible();
		const start = await handleBar(page, "start");
		expect(Math.abs(start.centre - first.left), "on the first fragment's left edge").toBeLessThan(
			2,
		);
		// A sanity check, not the fix: a bounding box starts on the first line too.
		expect(start.top, "on the first fragment's line").toBeLessThan(last.top - 1);
	});
}
