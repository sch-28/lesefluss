import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { JeepSqlite } from "jeep-sqlite/dist/components/jeep-sqlite";
import { createCapacitorDriver } from "../native";
import type { DbDriver } from "../types";

async function initJeepStore(): Promise<void> {
	if (!customElements.get("jeep-sqlite")) customElements.define("jeep-sqlite", JeepSqlite);
	if (!document.querySelector("jeep-sqlite")) {
		const el = document.createElement("jeep-sqlite") as HTMLElement & {
			autoSave: boolean;
			wasmPath: string;
		};
		el.autoSave = true;
		// Hosted under /app/ (web embed), the WASM lives at /app/assets/ instead of /assets/
		if (import.meta.env.VITE_WEB_BUILD) el.wasmPath = "/app/assets";
		document.body.appendChild(el);
	}
	await customElements.whenDefined("jeep-sqlite");
	await new SQLiteConnection(CapacitorSQLite).initWebStore();
}

/** The jeep-sqlite store in IndexedDB, for browsers without OPFS or a failed move. */
export async function createLegacyDriver(): Promise<DbDriver> {
	await initJeepStore();
	return createCapacitorDriver("legacy");
}
