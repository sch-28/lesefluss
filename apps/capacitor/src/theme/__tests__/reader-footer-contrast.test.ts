import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const monochrome = read("../monochrome.css");
const tokens = read("../../../../../packages/ui/src/styles/tokens.css");

function variable(css: string, selector: string, name: string): string {
	const start = css.indexOf(`${selector} {`);
	expect(start).toBeGreaterThan(-1);
	const block = css.slice(start, css.indexOf("}", start));
	const value = block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
	if (!value) throw new Error(`${selector} has no hex ${name}`);
	return value;
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe("reader footer contrast", () => {
	it("keeps the sepia footer label at 4.5:1 on the sepia page", () => {
		const label = variable(monochrome, ".reader-theme-sepia", "--reader-progress-label");
		const page = variable(tokens, ".theme-sepia", "--background");
		expect(contrast(label, page)).toBeGreaterThanOrEqual(4.5);
	});
});
