import { Capacitor } from "@capacitor/core";
import { JeepSqlite } from "jeep-sqlite/dist/components/jeep-sqlite";
import { sqliteConnection } from "./index";

/**
 * Bootstrap the jeep-sqlite web component for browser-based SQLite support.
 * Must be called before any DB operations when running on the web platform.
 * No-op on native (Android/iOS).
 */
export async function initWebSqlite(): Promise<void> {
	if (Capacitor.getPlatform() !== "web") return;

	customElements.define("jeep-sqlite", JeepSqlite);
	const el = document.createElement("jeep-sqlite") as HTMLElement & { autoSave: boolean };
	el.autoSave = true;
	document.body.appendChild(el);
	await customElements.whenDefined("jeep-sqlite");
	await sqliteConnection.initWebStore();
}
