import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../variables.css"), "utf8");

function sepiaSidebarRules(): string[] {
	return [...css.matchAll(/\.theme-sepia\s*:is\([^)]*text-sidebar-foreground[^{]*\{[^}]*\}/g)].map(
		(m) => m[0],
	);
}

describe("sepia sidebar text", () => {
	it("keeps faded sidebar text at full colour, but not the active item's primary", () => {
		const rest = sepiaSidebarRules().find((rule) => !rule.includes(":hover"));
		expect(rest).toContain("color: var(--sidebar-foreground)");
		expect(rest).toContain(':not(\n\t[data-active="true"]\n)');
	});

	it("gives hover a cue other than the colour it already has at rest", () => {
		const hover = sepiaSidebarRules().find((rule) => rule.includes(":hover"));
		expect(hover).toContain(':not(\n\t[data-active="true"]\n)');
		expect(hover).toContain("text-decoration: underline");
	});
});
