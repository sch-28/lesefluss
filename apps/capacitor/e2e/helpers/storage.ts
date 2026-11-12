import { type Page, test } from "@playwright/test";

/**
 * Wipe IndexedDB, OPFS and storage so each test starts from a clean library and
 * no leftover tanstack-query persistence. Runs on a static file, before the app
 * boots, so no database worker or jeep-sqlite holds the stores being deleted.
 */
export async function resetStorage(page: Page) {
	await test.step("setup: reset storage", () => wipe(page), { box: true });
}

async function wipe(page: Page) {
	await page.goto("/favicon.png");
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		await Promise.all(
			dbs.map(
				(db) =>
					new Promise<void>((resolve) => {
						if (!db.name) return resolve();
						const req = indexedDB.deleteDatabase(db.name);
						req.onsuccess = req.onerror = req.onblocked = () => resolve();
					}),
			),
		);
		const opfs = await navigator.storage.getDirectory();
		await opfs.removeEntry("lesefluss", { recursive: true }).catch(() => {});
		localStorage.clear();
		sessionStorage.clear();
	});
}
