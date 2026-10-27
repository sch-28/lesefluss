import type { SyncSettings } from "@lesefluss/core";
import type { Page } from "@playwright/test";

/** Settings as a pull from another device lands them. */
export async function applyRemoteSettings(page: Page, patch: Partial<SyncSettings>) {
	await page.evaluate((patch) => {
		const apply = window.__lesefluss_e2e_applyRemoteSettings;
		if (!apply) throw new Error("No __lesefluss_e2e_applyRemoteSettings hook");
		return apply(patch);
	}, patch);
}
