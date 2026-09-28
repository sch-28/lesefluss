import { expect, type Page, test } from "@playwright/test";
import { resetAppStorage } from "./support/app";

/**
 * TASK-175.6: the web build keeps its SQLite database as one IndexedDB entry
 * that jeep-sqlite replaces after every write. Leaving the page mid-save must
 * keep a database there (the old or the new one), never lose it. Unpatched
 * jeep-sqlite 2.8.0 deleted the entry first, so this lost the whole database.
 */
const JEEP_DB = "lesefluss";
const STORE_KEY = "leseflussSQLite.db";

type JeepElement = {
	execute(o: { database: string; statements: string }): Promise<unknown>;
	saveToStore(o: { database: string }): Promise<void>;
};

async function storedBytes(page: Page): Promise<number> {
	return page.evaluate(async (key) => {
		const db: IDBDatabase = await new Promise((resolve, reject) => {
			const req = indexedDB.open("jeepSqliteStore");
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const value = await new Promise<unknown>((resolve) => {
			const req = db.transaction("databases").objectStore("databases").get(key);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(undefined);
		});
		db.close();
		return value instanceof Uint8Array ? value.byteLength : 0;
	}, STORE_KEY);
}

test("leaving the page while the database is being saved keeps it in the store", async ({
	page,
}) => {
	await resetAppStorage(page);
	await page.goto("/app/tabs/library");
	await expect(page.getByText("No books yet")).toBeVisible();

	// A large database (book content lives in it) makes the save slow enough to leave mid-way.
	await page.evaluate(async (database) => {
		const jeep = document.querySelector("jeep-sqlite") as unknown as JeepElement;
		await jeep.execute({
			database,
			statements:
				"CREATE TABLE e2e_ballast(x BLOB); INSERT INTO e2e_ballast VALUES (randomblob(30000000));",
		});
		await jeep.saveToStore({ database });
	}, JEEP_DB);
	const before = await storedBytes(page);
	expect(before).toBeGreaterThan(30_000_000);

	await page.evaluate((database) => {
		const jeep = document.querySelector("jeep-sqlite") as unknown as JeepElement;
		void jeep.saveToStore({ database });
		location.href = "/robots.txt";
	}, JEEP_DB);
	await page.waitForURL(/robots\.txt$/);

	expect(await storedBytes(page)).toBe(before);
});
