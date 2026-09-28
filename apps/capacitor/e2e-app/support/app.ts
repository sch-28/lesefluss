import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect, type Page, request } from "@playwright/test";
import { PASSWORD, USERS } from "./users.mjs";

export type UserKey = keyof typeof USERS;
export { USERS };

export const BASE_URL = `http://localhost:${process.env.E2E_APP_PORT}`;

export function authFile(user: UserKey): string {
	return fileURLToPath(new URL(`../.auth/${user}.json`, import.meta.url));
}

/** Fills the website's /login form, already open, and submits it. */
export async function submitLogin(page: Page, user: UserKey) {
	await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
	await page.getByLabel("Email").fill(USERS[user].email);
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The user's cookie session from setup, for API calls a spec needs but does not test. */
export function apiAs(user: UserKey): Promise<APIRequestContext> {
	return request.newContext({ baseURL: BASE_URL, storageState: authFile(user) });
}

export async function postJson<T = unknown>(
	api: APIRequestContext,
	path: string,
	data?: unknown,
): Promise<T> {
	const res = await api.post(path, { data: data ?? {} });
	if (!res.ok()) throw new Error(`POST ${path}: ${res.status()} ${await res.text()}`);
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

export async function getJson<T = unknown>(api: APIRequestContext, path: string): Promise<T> {
	const res = await api.get(path);
	if (!res.ok()) throw new Error(`GET ${path}: ${res.status()} ${await res.text()}`);
	return (await res.json()) as T;
}

/**
 * Wipes the app's local data (IndexedDB, storage). Runs from a plain page on the
 * same origin, so the app never boots and holds no open database handle.
 */
export async function resetAppStorage(page: Page) {
	await page.goto("/robots.txt");
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		await Promise.all(
			dbs.map(
				(db) =>
					new Promise<void>((done) => {
						if (!db.name) return done();
						const req = indexedDB.deleteDatabase(db.name);
						req.onsuccess = req.onerror = req.onblocked = () => done();
					}),
			),
		);
		localStorage.clear();
		sessionStorage.clear();
	});
}

export const LIVE_BOOK = {
	bookId: "e2e0b001",
	title: "The Live Board Test",
	paragraphs: Array.from(
		{ length: 120 },
		(_, i) =>
			`Paragraph ${i + 1} walks along the river while the evening light settles on the water and the town grows quiet behind the old stone bridge.`,
	),
};
