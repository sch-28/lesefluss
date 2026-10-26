import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import type { SyncSettings } from "@lesefluss/core";
import { expect, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A reader font is a layout change like any other, with one more way to go
 * wrong: text laid out before its face has loaded is measured in the fallback,
 * then reflows when the face arrives. Page mode would paginate the fallback
 * and land a turn on a page that no longer holds the reader's word.
 */

async function applyRemoteSettings(page: Page, patch: Partial<SyncSettings>) {
	await page.evaluate((patch) => {
		const apply = window.__lesefluss_e2e_applyRemoteSettings;
		if (!apply) throw new Error("No __lesefluss_e2e_applyRemoteSettings hook");
		return apply(patch);
	}, patch);
}

/**
 * Holds a face's files back, as a slow storage read or a first web visit does.
 * Through CDP with a URL pattern rather than page.route, which would turn the
 * HTTP cache off for every request and crawl the dev server's module loads.
 */
async function delayFace(page: Page, pattern: string, ms: number) {
	const cdp = await page.context().newCDPSession(page);
	cdp.on("Fetch.requestPaused", ({ requestId }) => {
		setTimeout(() => void cdp.send("Fetch.continueRequest", { requestId }).catch(() => {}), ms);
	});
	await cdp.send("Fetch.enable", {
		patterns: [{ urlPattern: `*${pattern}*.woff2*`, requestStage: "Request" }],
	});
}

/** Whether the face's regular weight had loaded, rather than the reader giving up waiting. */
const isFaceLoaded = (page: Page, family: string, weight = "400") =>
	page.evaluate(
		([family, weight]) =>
			[...document.fonts].some(
				(f) =>
					f.family.replace(/"/g, "") === family && f.weight === weight && f.status === "loaded",
			),
		[family, weight] as const,
	);

const fontOfText = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector(".reader-paragraph");
		return p ? `${getComputedStyle(p).fontFamily}|${getComputedStyle(p).fontWeight}` : "";
	});

async function openPlainInPageMode(page: Page) {
	await page.setViewportSize({ width: 420, height: 900 });
	await seedFixture(page, plainBookFixture(), "plain.epub");
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	// Not through the popover: its font picker sets each label in its own face,
	// which would load the faces these tests need cold.
	await applyRemoteSettings(page, { paginationStyle: "page" });
	await expect(page.locator(".page-view")).toBeVisible();
	await reader.turnPages(page, 5);
	await reader.waitPositionQuiet(page);
	return { id: reader.bookIdFromUrl(page), word: await reader.pageModeFirstVisibleWord(page) };
}

for (const { name, patch } of [
	{ name: "a bundled font", patch: { readerFontFamily: "opendyslexic" } },
] satisfies { name: string; patch: Partial<SyncSettings> }[]) {
	test(`page mode: ${name} pulled in by sync keeps the current word on screen, saves nothing, and turns on from there`, async ({
		page,
	}) => {
		const { id, word } = await openPlainInPageMode(page);
		const saves = await reader.saveRequestCount(page);
		const before = await fontOfText(page);
		await delayFace(page, "opendyslexic", 1200);

		await applyRemoteSettings(page, patch);

		await expect.poll(() => fontOfText(page), { timeout: 10_000 }).not.toBe(before);
		await reader.expectWordVisibleInPage(page, word);
		await reader.waitPositionQuiet(page);
		expect(await reader.saveRequestCount(page), "a layout change saves nothing").toBe(saves);

		await reader.turnPages(page, 1);
		const turned = await reader.pageModeFirstVisibleWord(page);
		expect(await reader.lastSavedWord(page)).toBe(turned);
		await reader.leaveFlushed(page);
		expect((await reader.savedRow(page, id))?.wordPosition).toBe(turned);
		await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
		await reader.expectLoaded(page);
		await reader.expectWordVisibleInPage(page, turned);
	});
}

test("page mode: bold text pulled in by sync at the end of a chunk keeps that word on screen and saves nothing", async ({
	page,
}) => {
	await page.setViewportSize({ width: 420, height: 900 });
	await seedFixture(page, plainBookFixture(), "plain.epub");
	// Bold OpenDyslexic adds a page over the chunk: on its last page the drift
	// is a whole page, so a page index the change didn't re-derive shows other text.
	await applyRemoteSettings(page, { readerFontFamily: "opendyslexic", paginationStyle: "page" });
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitPositionQuiet(page);
	const id = reader.bookIdFromUrl(page);
	const lastOfChunk =
		(await page.evaluate(() =>
			Number(
				document.querySelector('[data-chunk-index="1"] span[data-word]')?.getAttribute("data-word"),
			),
		)) - 1;
	await page.evaluate(
		([id, word]) =>
			window.__lesefluss_e2e_remotePosition?.(id as string, word as number, Date.now()),
		[id, lastOfChunk] as const,
	);
	await reader.expectWordVisibleInPage(page, lastOfChunk);
	await reader.waitPositionQuiet(page);
	const saves = await reader.saveRequestCount(page);
	const before = await fontOfText(page);

	await applyRemoteSettings(page, { readerBold: true });

	await expect.poll(() => fontOfText(page)).not.toBe(before);
	await reader.expectWordVisibleInPage(page, lastOfChunk);
	await reader.waitPositionQuiet(page);
	expect(await reader.saveRequestCount(page), "a layout change saves nothing").toBe(saves);
});

test("page mode: opening in a bundled font whose file is slow lands on the saved word", async ({
	page,
}) => {
	const { id } = await openPlainInPageMode(page);
	const saved = (await reader.savedRow(page, id))?.wordPosition ?? 0;
	await reader.leaveFlushed(page);
	await applyRemoteSettings(page, { readerFontFamily: "opendyslexic" });

	await delayFace(page, "opendyslexic", 1500);
	await page.reload();
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	expect(
		await isFaceLoaded(page, "OpenDyslexic"),
		"the text appeared once the face had loaded",
	).toBe(true);

	await expect.poll(() => fontOfText(page)).toMatch(/^OpenDyslexic/);
	await reader.expectWordVisibleInPage(page, saved);
	await reader.turnPages(page, 1);
	expect(await reader.lastSavedWord(page)).toBe(await reader.pageModeFirstVisibleWord(page));
});

const PLAIN_HEADED_TITLE = "Headed";

/** Headings only from paragraph 40 on, below the first screen: the bold face they use isn't needed at open. */
function headedFixture(): EpubFixture {
	const words = (n: number) => Array.from({ length: 60 }, (_, i) => `h${n}x${i}`).join(" ");
	const body = Array.from(
		{ length: 80 },
		(_, n) => `${n >= 40 && n % 4 === 0 ? `<h2>Part ${n}</h2>` : ""}<p>${words(n)}</p>`,
	).join("");
	return {
		title: PLAIN_HEADED_TITLE,
		chapters: [{ id: "c1", href: "c1.htm", body }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

/** Holds a face's files back until the returned release is called; later requests go straight through. */
async function holdFace(page: Page, pattern: string): Promise<() => Promise<void>> {
	const cdp = await page.context().newCDPSession(page);
	const held: string[] = [];
	let isReleased = false;
	cdp.on("Fetch.requestPaused", ({ requestId }) => {
		if (isReleased) void cdp.send("Fetch.continueRequest", { requestId }).catch(() => {});
		else held.push(requestId);
	});
	await cdp.send("Fetch.enable", {
		patterns: [{ urlPattern: `*${pattern}*.woff2*`, requestStage: "Request" }],
	});
	return async () => {
		await expect.poll(() => held.length, "the face was requested").toBeGreaterThan(0);
		isReleased = true;
		for (const requestId of held)
			await cdp.send("Fetch.continueRequest", { requestId }).catch(() => {});
	};
}

test("scroll mode: a reader face landing mid-scroll waits for the scroll to end before re-anchoring", async ({
	page,
}) => {
	await page.setViewportSize({ width: 420, height: 900 });
	await seedFixture(page, headedFixture(), "headed.epub");
	await applyRemoteSettings(page, { readerFontFamily: "opendyslexic" });
	// Held past the reader's 3 s wait, so the text opens without the bold face
	// and it lands only when released, under a moving scroll.
	const releaseBold = await holdFace(page, "opendyslexic-latin-700");
	await openBookFromLibrary(page, PLAIN_HEADED_TITLE);
	await reader.expectLoaded(page);
	await reader.waitHoldIdle(page);

	await page.evaluate(() => {
		const w = window as unknown as { __lesefluss_e2e_hold?: string; __holdPhases?: string[] };
		w.__holdPhases = [];
		let last = w.__lesefluss_e2e_hold;
		setInterval(() => {
			if (w.__lesefluss_e2e_hold !== last) {
				last = w.__lesefluss_e2e_hold;
				if (last && last !== "idle") w.__holdPhases?.push(last);
			}
		}, 10);
	});
	await reader.wheel(page, 1);
	for (let i = 0; i < 10; i++) {
		await page.mouse.wheel(0, 230);
		await page.waitForTimeout(60);
	}
	await releaseBold();
	// On until the face has landed, then a few steps more: it lands mid-scroll.
	let stepsAfterLoad = 0;
	for (let i = 0; i < 120 && stepsAfterLoad < 5; i++) {
		await page.mouse.wheel(0, 120);
		await page.waitForTimeout(60);
		if (await isFaceLoaded(page, "OpenDyslexic", "700")) stepsAfterLoad++;
	}
	const phasesWhileScrolling = await page.evaluate(
		() => (window as unknown as { __holdPhases?: string[] }).__holdPhases ?? [],
	);

	expect(stepsAfterLoad, "the bold face landed mid-scroll").toBe(5);
	expect(phasesWhileScrolling, "no re-anchor under a moving scroll").toEqual([]);
});
