import { readFileSync } from "node:fs";
import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * LESE-121.6: memory and position-save time with one book, then with ~200 MB of
 * stored images, on the OPFS store and on the legacy jeep-sqlite store it replaced
 * (the "before"). Reports numbers, asserts none of them: `pnpm e2e:dbscale`, then
 * read the `db-scale` lines. Chromium only (renderer memory comes from CDP + /proc).
 */
const BALLAST_CHUNKS = 10;
const BALLAST_ROWS_PER_CHUNK = 10;
// hex() doubles the bytes: each row stores 2 MB of text, like a base64 image does.
const BALLAST_RANDOM_BYTES = 1_000_000;
const SAVES = 20;

type Measurement = {
	storedMb: number;
	rendererRssMb: number;
	jsHeapMb: number;
	saveP50Ms: number;
	saveP95Ms: number;
};

const mb = (bytes: number) => Math.round(bytes / 1e5) / 10;

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 10) / 10;
}

function rssBytes(pid: number): number {
	const match = readFileSync(`/proc/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+) kB/m);
	return match ? Number(match[1]) * 1024 : 0;
}

/** Every renderer's resident memory: the page and its database worker share one. */
async function rendererRss(browser: Browser): Promise<number> {
	const cdp = await browser.newBrowserCDPSession();
	const { processInfo } = (await cdp.send("SystemInfo.getProcessInfo")) as {
		processInfo: { type: string; id: number }[];
	};
	await cdp.detach();
	return processInfo
		.filter((p) => p.type === "renderer")
		.reduce((sum, p) => sum + rssBytes(p.id), 0);
}

async function query<T>(page: Page, sql: string): Promise<T[]> {
	return (await page.evaluate((sql) => window.__lesefluss_e2e_db?.query(sql), sql)) as T[];
}

/**
 * Copies of the open book, each with its images. Images of a book that doesn't
 * exist are deleted on the next start, so every image row hangs off a book.
 */
async function seedBallast(page: Page, bookId: string) {
	for (let chunk = 0; chunk < BALLAST_CHUNKS; chunk++) {
		const id = `e2eball${chunk}`;
		await page.evaluate(
			(sql) => window.__lesefluss_e2e_db?.execute(sql),
			`CREATE TEMP TABLE e2e_book AS SELECT * FROM books WHERE id = '${bookId}';
			UPDATE e2e_book SET id = '${id}', title = 'Ballast ${chunk}';
			INSERT INTO books SELECT * FROM e2e_book;
			DROP TABLE e2e_book;
			CREATE TEMP TABLE e2e_content AS SELECT * FROM book_content WHERE book_id = '${bookId}';
			UPDATE e2e_content SET book_id = '${id}';
			INSERT INTO book_content SELECT * FROM e2e_content;
			DROP TABLE e2e_content;
			WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < ${BALLAST_ROWS_PER_CHUNK - 1})
			INSERT INTO book_images (book_id, key, mime, data)
			SELECT '${id}', 'img-' || i, 'image/jpeg', hex(randomblob(${BALLAST_RANDOM_BYTES})) FROM n;`,
		);
	}
}

/** A fresh load with the book open, then the saves, then memory after a GC. */
async function measure(page: Page, browser: Browser, bookId: string): Promise<Measurement> {
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	const [{ bytes }] = await query<{ bytes: number }>(
		page,
		"SELECT coalesce(sum(length(data)), 0) AS bytes FROM book_images",
	);

	const saves: number[] = [];
	for (let i = 0; i < SAVES; i++) {
		saves.push(
			(await page.evaluate(
				({ bookId, word }) => window.__lesefluss_e2e_db?.timePositionSave(bookId, word),
				{ bookId, word: 100 + i },
			)) as number,
		);
	}

	const cdp = await page.context().newCDPSession(page);
	await cdp.send("HeapProfiler.collectGarbage");
	await cdp.send("Performance.enable");
	const { metrics } = await cdp.send("Performance.getMetrics");
	await cdp.detach();
	return {
		storedMb: mb(bytes),
		rendererRssMb: mb(await rendererRss(browser)),
		jsHeapMb: mb(metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0),
		saveP50Ms: percentile(saves, 0.5),
		saveP95Ms: percentile(saves, 0.95),
	};
}

for (const store of ["opfs", "legacy"] as const) {
	test(`memory and save time from one book to ~200 MB on the ${store} store @dbscale`, async ({
		page,
		browser,
	}) => {
		test.setTimeout(20 * 60_000);
		await resetStorage(page);
		if (store === "legacy") {
			await page.addInitScript(() => {
				Object.defineProperty(StorageManager.prototype, "getDirectory", {
					value: undefined,
					configurable: true,
				});
			});
		}
		await importEpubViaFilePicker(page, {
			buffer: await buildEpubBuffer(plainBookFixture()),
			fileName: "plain.epub",
			title: PLAIN_BOOK_TITLE,
		});
		await expect.poll(() => page.evaluate(() => window.__lesefluss_e2e_db?.kind())).toBe(store);
		const [{ id }] = await query<{ id: string }>(page, "SELECT id FROM books");

		const small = await measure(page, browser, id);
		await seedBallast(page, id);
		const large = await measure(page, browser, id);

		expect(large.storedMb).toBeGreaterThan(190);
		const result = { store, small, large };
		console.log(`db-scale ${JSON.stringify(result)}`);
		await test.info().attach("db-scale.json", {
			body: JSON.stringify(result, null, 2),
			contentType: "application/json",
		});
	});
}
