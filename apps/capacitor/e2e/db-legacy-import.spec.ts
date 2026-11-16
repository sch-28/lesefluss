import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { importEpubViaFilePicker, resetStorage } from "./helpers/seed";

const HIDE_OPFS = "e2e:hide-opfs";
const FAIL_MOVE = "lesefluss:e2e-fail-move";
const book = `[data-book-title="${PLAIN_BOOK_TITLE}"]`;

/** Bytes of the database in the old jeep-sqlite IndexedDB store, 0 when absent. */
function legacyBytes(page: Page): Promise<number> {
	return page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		if (!dbs.some((d) => d.name === "jeepSqliteStore")) return 0;
		const db: IDBDatabase = await new Promise((resolve, reject) => {
			const req = indexedDB.open("jeepSqliteStore");
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		try {
			if (!db.objectStoreNames.contains("databases")) return 0;
			const value = await new Promise<unknown>((resolve) => {
				const req = db.transaction("databases").objectStore("databases").get("leseflussSQLite.db");
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => resolve(undefined);
			});
			return value instanceof Uint8Array ? value.byteLength : 0;
		} finally {
			db.close();
		}
	});
}

function opfsActive(page: Page): Promise<boolean> {
	return page.evaluate(async () => {
		try {
			const root = await navigator.storage.getDirectory();
			const dir = await root.getDirectoryHandle("lesefluss");
			await dir.getFileHandle("opfs-active");
			return true;
		} catch {
			return false;
		}
	});
}

function setFlag(page: Page, key: string, on: boolean) {
	return page.evaluate(
		([k, v]) => (v ? localStorage.setItem(k, "1") : localStorage.removeItem(k)),
		[key, on] as const,
	);
}

function storageLog(page: Page): string[] {
	const lines: string[] = [];
	page.on("console", (msg) => {
		if (msg.text().includes("web storage:")) lines.push(msg.text());
	});
	return lines;
}

/** Imports a book while the app runs on the legacy IndexedDB store, as a pre-2.2 web user would have. */
async function seedLegacyLibrary(page: Page) {
	await resetStorage(page);
	await page.addInitScript((flag) => {
		if (localStorage.getItem(flag) !== "1") return;
		Object.defineProperty(StorageManager.prototype, "getDirectory", {
			value: undefined,
			configurable: true,
		});
	}, HIDE_OPFS);
	await setFlag(page, HIDE_OPFS, true);
	await importEpubViaFilePicker(page, {
		buffer: await buildEpubBuffer(plainBookFixture()),
		fileName: "plain.epub",
		title: PLAIN_BOOK_TITLE,
	});
	await expect.poll(() => legacyBytes(page)).toBeGreaterThan(0);
	expect(await opfsActive(page)).toBe(false);
	await setFlag(page, HIDE_OPFS, false);
}

test("a legacy IndexedDB library moves to OPFS and the legacy copy is removed", async ({
	page,
}) => {
	await seedLegacyLibrary(page);
	const log = storageLog(page);

	await page.reload();
	await expect(page.locator(book)).toHaveCount(1, { timeout: 20_000 });
	expect(log.some((l) => l.includes("OPFS (moved)"))).toBe(true);
	expect(await opfsActive(page)).toBe(true);
	await expect.poll(() => legacyBytes(page)).toBe(0);

	await page.reload();
	await expect(page.locator(book)).toHaveCount(1, { timeout: 20_000 });
	expect(log.some((l) => l.includes("OPFS (existing)"))).toBe(true);
});

test("a failed move keeps the app on the legacy store and retries on the next start", async ({
	page,
}) => {
	await seedLegacyLibrary(page);
	const bytes = await legacyBytes(page);
	await setFlag(page, FAIL_MOVE, true);

	await page.reload();
	await expect(page.locator(book)).toHaveCount(1, { timeout: 20_000 });
	await expect(page.getByText("Lesefluss can't start")).toHaveCount(0);
	expect(await opfsActive(page)).toBe(false);
	expect(await legacyBytes(page)).toBeGreaterThanOrEqual(bytes);

	await setFlag(page, FAIL_MOVE, false);
	const log = storageLog(page);
	await page.reload();
	await expect(page.locator(book)).toHaveCount(1, { timeout: 20_000 });
	expect(log.some((l) => l.includes("OPFS (moved)"))).toBe(true);
	expect(await opfsActive(page)).toBe(true);
	await expect.poll(() => legacyBytes(page)).toBe(0);
});
