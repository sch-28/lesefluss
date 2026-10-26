import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page } from "@playwright/test";
import { isOnTopEdge } from "../src/pages/reader/top-edge";
import { type FramedPage, test } from "./helpers/framed-page";
import { DEEP_CHAPTER_LABEL, novelFixture, UNIFORM_NOVEL_TITLE } from "./helpers/novel-book";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A paragraph at or above the top edge changing height (VList measuring it for
 * the first time, a late image, a font swap) is not the reader moving: nothing
 * may be saved. Fractional heights, as a real layout gives them, so rounding is
 * part of it.
 */

const VIEWPORT = { width: 1100, height: 900 };
const GROW_PX = 37.3;
// Past the hold's quiet and correction even at a frame a second.
const IDLE_MS = 3000;

/**
 * Grows a mounted paragraph by `px`: the last one wholly above the reader's top
 * edge ("above"), or the one the edge cuts through, at its top ("cut").
 */
async function growParagraph(page: Page, where: "above" | "cut", px: number): Promise<void> {
	const grown = await page.evaluate(
		({ where, px }) => {
			const container = document.querySelector<HTMLElement>(".reader-scroll-content");
			const items = container?.firstElementChild?.firstElementChild?.children;
			if (!container || !items) return false;
			const top = container.getBoundingClientRect().top;
			const item = [...items].findLast((item) => {
				const rect = item.getBoundingClientRect();
				return where === "above" ? rect.bottom <= top : rect.top < top && rect.bottom > top;
			});
			const paragraph = item?.firstElementChild as HTMLElement | undefined;
			if (!paragraph) return false;
			if (where === "above") paragraph.style.paddingBottom = `${px}px`;
			else paragraph.style.paddingTop = `${px}px`;
			return true;
		},
		{ where, px },
	);
	if (!grown) throw new Error(`No mounted paragraph ${where} the top edge to grow`);
}

/**
 * Nothing was saved, and the saved word's line is where it was before the
 * resize: corrected back by a hold (which at a frame a second takes a while),
 * or never moved. After a settle that need not be the top edge: when the edge
 * cuts a line, the next one is saved.
 */
async function expectHeld(page: Page, word: number, at: number, savesBefore: number) {
	const whereItWas = async () => {
		const offset = await reader.wordLineOffsetFromTop(page, word);
		return Math.abs(offset - at) < 2
			? "where it was"
			: `${offset}px from the top edge, was ${at}px`;
	};
	await expect
		.poll(whereItWas, { message: "the saved word's line", timeout: 15_000 })
		.toBe("where it was");
	// A save from the correction's own scroll end would be decided a few frames later.
	await reader.waitFramesIdle(page);
	expect(await reader.saveRequestCount(page), "saves after the resize").toBe(savesBefore);
	const id = reader.bookIdFromUrl(page);
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(word);
}

for (const frameMs of [16, 1000]) {
	const fps = Math.round(1000 / frameMs);
	const tag = frameMs > 16 ? ["@lowfps"] : [];

	test.describe(`at ${fps} fps`, { tag }, () => {
		test.setTimeout(300_000);

		async function openDeep(framedPage: (o: { viewport: typeof VIEWPORT }) => Promise<FramedPage>) {
			const framed = await framedPage({ viewport: VIEWPORT });
			const { page } = framed;
			await resetStorage(page);
			await importEpubViaFilePicker(page, {
				buffer: await buildEpubBuffer(novelFixture({ uniform: true })),
				fileName: "novel.epub",
				title: UNIFORM_NOVEL_TITLE,
			});
			await openBookFromLibrary(page, UNIFORM_NOVEL_TITLE);
			framed.setFrameMs(frameMs);
			await reader.tocJumpToChapter(page, DEEP_CHAPTER_LABEL);
			await reader.waitPastJumpGuard(page);
			await reader.commitReadFromHere(page);
			await page.waitForTimeout(IDLE_MS);
			return framed;
		}

		test("the paragraph at the top edge growing after a reopen saves nothing and keeps the line on top", async ({
			framedPage,
		}) => {
			const { page } = await openDeep(framedPage);
			const word = await reader.lastSavedWord(page);
			await reader.leaveFlushed(page);
			await openBookFromLibrary(page, UNIFORM_NOVEL_TITLE);
			await reader.waitRevealed(page);
			await page.waitForTimeout(IDLE_MS);
			const before = await reader.saveRequestCount(page);
			const at = await reader.wordLineOffsetFromTop(page, word);
			expect(isOnTopEdge(at), `a reopen lands the saved word's line on top, not ${at}px`).toBe(
				true,
			);

			await growParagraph(page, "cut", GROW_PX);
			await page.waitForTimeout(IDLE_MS);

			await expectHeld(page, word, at, before);
		});

		// A guard, not a red-to-green case: VList keeps the text still for a paragraph
		// wholly above, so this only fails if that or the settle rule regresses.
		test("a paragraph above growing after the reader's own scroll saves nothing and moves nothing", async ({
			framedPage,
		}) => {
			const { page } = await openDeep(framedPage);
			// Down, then back up: VList only mounts paragraphs ahead in the scroll direction.
			for (const deltaY of [900, -300]) {
				const savePending = reader.waitForNextSave(page);
				await reader.wheel(page, deltaY);
				await savePending;
				await page.waitForTimeout(IDLE_MS);
			}
			const word = await reader.lastSavedWord(page);
			const before = await reader.saveRequestCount(page);
			const at = await reader.wordLineOffsetFromTop(page, word);

			await growParagraph(page, "above", GROW_PX);
			await page.waitForTimeout(IDLE_MS);

			await expectHeld(page, word, at, before);
		});
	});
}
