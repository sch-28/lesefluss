import type { Page } from "@playwright/test";

/**
 * Wipe IndexedDB + storage so each test starts from a clean library and no
 * leftover tanstack-query persistence. Must be called before the app boots
 * (i.e. before navigating into a route that opens the SQLite connection),
 * otherwise jeep-sqlite holds an open handle to the about-to-be-deleted DB.
 */
export async function resetStorage(page: Page) {
	await page.goto("/");
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
		localStorage.clear();
		sessionStorage.clear();
	});
}
