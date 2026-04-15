import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let _html: string | null = null;

/** Read the capacitor SPA index.html, cached in production. */
export function getSpaHtml(): string {
	if (process.env.NODE_ENV === "production" && _html) return _html;
	_html = readFileSync(resolve("public/app/index.html"), "utf-8");
	return _html;
}
