import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let cachedHtml: string | null = null;

/** Read the capacitor SPA index.html, cached in production. */
export function getSpaHtml(): string {
	if (process.env.NODE_ENV === "production" && cachedHtml) return cachedHtml;
	const devPath = resolve("public/app/index.html");
	const prodPath = resolve(".output/public/app/index.html");
	cachedHtml = readFileSync(existsSync(devPath) ? devPath : prodPath, "utf-8");
	return cachedHtml;
}
