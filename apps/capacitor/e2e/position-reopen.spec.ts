import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page } from "@playwright/test";
import { isOnTopEdge } from "../src/pages/reader/top-edge";
import { test } from "./helpers/framed-page";
import {
	DEEP_CHAPTER_LABEL,
	NOVEL_TITLE,
	novelFixture,
	UNIFORM_NOVEL_TITLE,
} from "./helpers/novel-book";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Reopening a book, with no input at all, must never save a different word.
 * In Chrome painting about once a second (an occluded window; a slow device
 * has the same shape) every reopen in scroll mode saved a word a line or more
 * away (TASK-206): scroll events and ResizeObserver callbacks only arrive with
 * frames, while the reader's guards and virtua's scroll-end debounce run on
 * timers, so the list's late corrections landed after the guards had expired.
 * At 60 fps, headless or headed, nothing drifted.
 */

const VIEWPORT = { width: 1100, height: 900 };
// Each reopen at 1 fps takes several seconds; REOPEN_COUNT raises it for a local run.
const REOPENS = Number(process.env.REOPEN_COUNT ?? 3);
// Real Chrome kept drifting for seconds after a reopen looked settled.
const IDLE_AFTER_OPEN_MS = 4000;

/**
 * Fractional line geometry, as a real font and line spacing give it: scrollTop
 * reads back as an integer at every DPR, so a sub-pixel line top comes from layout.
 */
const FRACTIONAL_METRICS = `
	.reader-scroll-content { --reader-line-height: 1.37 !important; }
	.reader-scroll-content > div { font-size: 17.3px !important; }
`;

function addStyleOnLoad(css: string) {
	document.addEventListener("DOMContentLoaded", () => {
		const style = document.createElement("style");
		style.textContent = css;
		document.head.append(style);
	});
}

type Reopen = { saves: { word: number; source: string }[]; dbWord: number | null; line: number };

async function reopenAndIdle(page: Page, title: string, how: "back" | "reload"): Promise<Reopen> {
	const before = await page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0);
	if (how === "back") {
		await reader.leaveFlushed(page);
	} else {
		await page.goto("/tabs/library");
	}
	await openBookFromLibrary(page, title);
	await reader.waitRevealed(page);
	await page.waitForTimeout(IDLE_AFTER_OPEN_MS);

	const id = reader.bookIdFromUrl(page);
	const dbWord = await reader.savedRow(page, id).then((row) => row?.wordPosition ?? null);
	const saves = await page.evaluate(
		(from) =>
			(window.__lesefluss_e2e_saveLog ?? [])
				.slice(from)
				.map(({ word, source }) => ({ word, source })),
		how === "back" ? before : 0,
	);
	const line = await reader.wordLineOffsetFromTop(page, dbWord ?? -1);
	return { saves, dbWord: dbWord ?? null, line };
}

const books = [
	{ name: "novel", title: NOVEL_TITLE, uniform: false },
	{ name: "uniform", title: UNIFORM_NOVEL_TITLE, uniform: true },
];

for (const book of books) {
	for (const frameMs of [16, 1000]) {
		const fps = Math.round(1000 / frameMs);
		test(`reopening ${book.name} at ${fps} fps, read deep into it, saves nothing new`, {
			tag: frameMs > 16 ? ["@lowfps"] : [],
		}, async ({ framedPage }) => {
			test.setTimeout(600_000);
			const { page, setFrameMs } = await framedPage({ viewport: VIEWPORT });
			await page.addInitScript(addStyleOnLoad, FRACTIONAL_METRICS);
			await resetStorage(page);
			const buffer = await buildEpubBuffer(novelFixture({ uniform: book.uniform }));
			await importEpubViaFilePicker(page, { buffer, fileName: "book.epub", title: book.title });
			await openBookFromLibrary(page, book.title);
			setFrameMs(frameMs);
			await reader.tocJumpToChapter(page, DEEP_CHAPTER_LABEL);
			await reader.waitPastJumpGuard(page);
			const committed = await reader.commitReadFromHere(page);
			await page.waitForTimeout(IDLE_AFTER_OPEN_MS);
			expect
				.soft(await reader.lastSavedWord(page), "Read from here, then no input")
				.toBe(committed);

			for (const how of ["back", "reload"] as const) {
				for (let i = 0; i < REOPENS; i++) {
					const r = await reopenAndIdle(page, book.title, how);
					expect.soft(r.dbWord, `${how} ${i}: the database row`).toBe(committed);
					expect
						.soft(
							r.saves.filter((s) => s.word !== committed),
							`${how} ${i}: saves of another word`,
						)
						.toEqual([]);
					// The saved word can sit mid-line; its line is the one on the top edge.
					expect.soft(isOnTopEdge(r.line), `${how} ${i}: line at ${r.line}px`).toBe(true);
				}
			}
		});
	}
}
