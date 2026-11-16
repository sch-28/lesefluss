import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../..");
// Delete flows are frozen (no further delete work), so its fields keep 32 px.
const ALLOWED = new Set(["components/sync/delete-account.tsx"]);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
		return path.endsWith(".tsx") && !path.endsWith(".test.tsx") ? [path] : [];
	});
}

const NOT_TEXT = /type="(checkbox|radio|file|hidden|range)"/;
const TALL_ENOUGH = /\b(min-)?h-(1[1-9]|[2-9]\d)\b/;

function unwrappedInputLines(source: string): number[] {
	const lines: number[] = [];
	for (const match of source.matchAll(/<(Input|input)[\s/>]/g)) {
		const before = source.slice(0, match.index);
		const tag = source.slice(match.index, source.indexOf("/>", match.index));
		if (match[1] === "input" && (NOT_TEXT.test(tag) || TALL_ENOUGH.test(tag))) continue;
		if (before.lastIndexOf("<InputHitArea") <= before.lastIndexOf("</InputHitArea>")) {
			lines.push(before.split("\n").length);
		}
	}
	return lines;
}

describe("text inputs on touch", () => {
	it("wraps every short text input in an InputHitArea so a tap lands across 44 px", () => {
		const unwrapped = sourceFiles(SRC)
			.map(
				(path) => [relative(SRC, path), unwrappedInputLines(readFileSync(path, "utf8"))] as const,
			)
			.filter(([path, lines]) => lines.length > 0 && !ALLOWED.has(path))
			.map(([path, lines]) => `${path}:${lines.join(",")}`);
		expect(unwrapped).toEqual([]);
	});
});
