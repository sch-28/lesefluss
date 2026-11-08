import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(
	resolve(__dirname, "../../../../../packages/ui/src/styles/tokens.css"),
	"utf8",
);

function coarseBlock(): string {
	const start = tokens.indexOf("@media (pointer: coarse)");
	expect(start).toBeGreaterThan(-1);
	return tokens.slice(start);
}

describe("touch targets", () => {
	it("gives buttons and toggles a 44px hit area only on a coarse pointer", () => {
		const block = coarseBlock();
		for (const target of ["button", '[role="button"]', '[role="switch"]', '[role="checkbox"]']) {
			expect(block).toContain(target);
		}
		expect(block).toMatch(
			/::before\s*\{[^}]*width:\s*max\(100%,\s*44px\)[^}]*height:\s*max\(100%,\s*44px\)/,
		);
		expect(tokens.slice(0, tokens.indexOf("@media (pointer: coarse)"))).not.toContain(
			"max(100%, 44px)",
		);
	});

	it("leaves elements that draw their own ::before alone", () => {
		expect(coarseBlock()).toMatch(/:not\(\s*\[class\*="before:"\]\s*\)::before/);
	});

	it("lets a plain-CSS ::before hit area replace the coarse-pointer box", () => {
		const monochrome = readFileSync(resolve(__dirname, "../monochrome.css"), "utf8");
		const insetBefore = [...monochrome.matchAll(/([.\w-]+)::before\s*\{[^}]*inset:/g)].map(
			(m) => m[1],
		);
		expect(insetBefore.length).toBeGreaterThan(0);
		const reset = monochrome.match(
			/((?:[.\w-]+::before,?\s*)+)\{\s*width: auto;\s*height: auto;\s*transform: none;/,
		);
		for (const selector of insetBefore) expect(reset?.[1]).toContain(`${selector}::before`);
	});

	it("grows menu rows instead of overhanging them", () => {
		expect(coarseBlock()).toMatch(
			/\[role="menuitem"\][\s\S]*\[role="option"\][\s\S]*min-height:\s*44px/,
		);
	});

	it("sits in the base layer so utilities like absolute still win", () => {
		expect(tokens).toMatch(/@layer base\s*\{\s*@media \(pointer: coarse\)/);
	});
});
