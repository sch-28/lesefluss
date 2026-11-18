import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const tokens = read("../../../../../packages/ui/src/styles/tokens.css");
const variables = read("../variables.css");
const eink = read("../eink.css");

function block(css: string, selector: string): string {
	const start = css.indexOf(`${selector} {`);
	expect(start, `${selector} block`).toBeGreaterThan(-1);
	return css.slice(start, css.indexOf("}", start));
}

function variable(css: string, selector: string, name: string): string {
	const value = block(css, selector).match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];
	if (!value) throw new Error(`${selector} has no ${name}`);
	return value.trim();
}

function srgb(color: string): number[] {
	if (color.startsWith("#")) {
		return [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16) / 255);
	}
	const match = color.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
	if (!match) throw new Error(`unsupported color ${color}`);
	const [l, c, h] = match.slice(1).map(Number);
	const a = c * Math.cos((h * Math.PI) / 180);
	const b = c * Math.sin((h * Math.PI) / 180);
	const lms = [
		l + 0.3963377774 * a + 0.2158037573 * b,
		l - 0.1055613458 * a - 0.0638541728 * b,
		l - 0.0894841775 * a - 1.291485548 * b,
	].map((x) => x ** 3);
	const linear = [
		4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
		-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
		-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
	];
	return linear
		.map((x) => Math.min(1, Math.max(0, x)))
		.map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
}

function luminance(color: string): number {
	const [r, g, b] = srgb(color).map((c) =>
		c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const themes = [
	["light", tokens, ":root"],
	["dark", tokens, ".dark"],
	["sepia", tokens, ".theme-sepia"],
	["high contrast", variables, ".dark.high-contrast"],
	["e-ink", eink, "html.eink"],
] as const;

describe("destructive contrast", () => {
	it("maps the label token into Tailwind, or text-destructive-foreground is never generated", () => {
		expect(tokens).toMatch(/--color-destructive-foreground:\s*var\(--destructive-foreground\);/);
	});

	it.each(
		themes,
	)("%s: the destructive button label and danger text reach 4.5:1", (_, css, selector) => {
		const destructive = variable(css, selector, "--destructive");
		const label = variable(css, selector, "--destructive-foreground");
		expect(contrast(label, destructive)).toBeGreaterThanOrEqual(4.5);
		for (const surface of ["--background", "--card", "--popover"]) {
			expect(
				contrast(destructive, variable(css, selector, surface)),
				surface,
			).toBeGreaterThanOrEqual(4.5);
		}
	});
});

function tint(color: string, alpha: number, surface: string): string {
	const [fg, bg] = [srgb(color), srgb(surface)];
	return `#${fg
		.map((c, i) => Math.round((c * alpha + bg[i] * (1 - alpha)) * 255))
		.map((c) => c.toString(16).padStart(2, "0"))
		.join("")}`;
}

describe("sepia status text contrast", () => {
	// Status text mostly renders on its own tint (bg-warning/10 badges, bg-info/20 frozen days).
	it.each([
		["--warning", 0.1],
		["--info", 0.2],
	] as const)("%s text reaches 4.5:1 on the page and on its own tint", (name, alpha) => {
		const color = variable(variables, ".theme-sepia", name);
		const surface = variable(tokens, ".theme-sepia", "--background");
		expect(contrast(color, surface)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(color, tint(color, alpha, surface))).toBeGreaterThanOrEqual(4.5);
	});
});
