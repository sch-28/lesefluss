import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let _html: string | null = null;

/** Read the capacitor SPA index.html, cached in production. */
export function getSpaHtml(): string {
	if (process.env.NODE_ENV === "production" && _html) return _html;
	// In production (Nitro node-server), public/ is copied to .output/public/
	const devPath = resolve("public/app/index.html");
	const prodPath = resolve(".output/public/app/index.html");
	_html = readFileSync(existsSync(devPath) ? devPath : prodPath, "utf-8");
	return _html;
}
