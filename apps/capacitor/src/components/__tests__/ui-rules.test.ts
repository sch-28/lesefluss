import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The handbook's greppable ui_rules (LESE-215). A line breaks a rule unless it, or the line
 *  above it, carries `ui-rules-allow: <rule> -- <reason>`, or its file is in FILE_ALLOW. The
 *  theme CSS is scanned by its own rules below. */

const REPO = resolve(__dirname, "../../../../..");
const ROOTS = ["apps/capacitor/src", "packages/ui/src"];

type Rule = { pattern: RegExp; allowedUnder?: string[] };

const RULES = {
	"locale-format": {
		pattern:
			/\.toLocale(String|DateString|TimeString)\(|\bIntl\.(NumberFormat|DateTimeFormat|RelativeTimeFormat|PluralRules|ListFormat)\b/,
		allowedUnder: ["apps/capacitor/src/utils/", "packages/ui/src/lib/"],
	},
	"transition-all": { pattern: /\btransition-all\b/ },
	"hover-scale": { pattern: /\bhover:scale-/ },
	// Tailwind's transition utilities already take the shared --ease-out (tokens.css).
	"motion-timing": {
		pattern: /\bduration-(?!(150|200|300)\b)(\d+|\[)|(^|[\s"'`:])ease-(in|in-out|linear|\[)/,
	},
	"font-size": { pattern: /\btext-\[[0-9.]|\btext-(3xl|5xl|6xl|7xl|8xl|9xl)\b/ },
	"font-weight": { pattern: /\bfont-(bold|extrabold|black)\b/ },
	// Margins and paddings may take any whole step (a component's inset is not a gap); gaps and
	// stacks take only the handbook's scale 1, 2, 3, 4, 6, 8.
	"off-grid-spacing": {
		pattern:
			/(^|[\s"'`:])-?(?:(m|p|gap|space)[trblxyse]?-(x-|y-)?(\[-?\d+(\.\d+)?px\]|([2-9]|1\d)\.5\b)|(gap|space)(-[xy])?-(?!(0|1|2|3|4|6|8)(?![\d.]))\d+(\.\d+)?\b)/,
	},
	"arbitrary-radius": { pattern: /\brounded(-[a-z]{1,2})?-\[/ },
	"uppercase-tracked": {
		pattern:
			/\buppercase\b[^"`]*\btracking-(wide|wider|widest|\[)|\btracking-(wide|wider|widest|\[)[^"`]*\buppercase\b/,
	},
	"section-title": { pattern: /book-detail-section-title|<h[1-6]\b[^>]*\buppercase\b/ },
	"raw-colour": {
		pattern:
			/\b(text|bg|border|ring|fill|stroke|from|to|via|shadow|outline|decoration|accent|caret|divide)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d|\b[a-z]+-\[#[0-9a-fA-F]{3,8}\]/,
	},
	"card-surface": {
		pattern:
			/^(?=.*(?:^|[\s"'`])rounded-(?:md|lg|xl|2xl|3xl)\b)(?=.*(?:^|[\s"'`])border(?=[\s"'`]))(?=.*(?:^|[\s"'`])bg-card\b)/,
		allowedUnder: ["apps/capacitor/src/components/card.tsx"],
	},
	"inline-style-type": { pattern: /style=\{\{[^}]*\b(fontSize|fontWeight|margin\w*)\s*:/ },
	"hex-colour": { pattern: /["'`]#[0-9a-fA-F]{3,8}\b/ },
} satisfies Record<string, Rule>;

type RuleName = keyof typeof RULES;

/** Files a rule exempts as a whole, each with its reason: only colour data maps, where every
 *  line would need the same allow comment. */
const FILE_ALLOW: Partial<Record<RuleName, Record<string, string>>> = {
	"raw-colour": {
		"apps/capacitor/src/components/appearance-pickers.tsx":
			"theme swatches show each theme's own colours, whatever theme is active",
		"apps/capacitor/src/pages/library/book-highlights.tsx":
			"the user's highlight colours, the same in every theme",
	},
	"hex-colour": {
		"apps/capacitor/src/contexts/theme-context.tsx":
			"native status bar and background colours per theme, which take a hex value",
		"apps/capacitor/src/pages/reader/selection-toolbar.tsx": "the user's highlight colours",
		"apps/capacitor/src/pages/reader/glossary-entry-modal.tsx": "the user's glossary colours",
		"apps/capacitor/src/pages/settings/rsvp-settings-form.tsx": "the user's focal letter colours",
		"apps/capacitor/src/pages/explore/web-novels-providers.ts": "each provider's brand colour",
		"apps/capacitor/src/services/stats/milestones.ts":
			"milestone badge artwork, the same in every theme",
		"apps/capacitor/src/services/share-card/render.ts":
			"a shared image drawn on a canvas, the same in every theme",
		"apps/capacitor/src/pages/reader/session-debug-badge.tsx": "a developer-only debug overlay",
	},
};

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

/** Blanks comments but keeps the line count, so offenders keep their line numbers. */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
		.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const ALLOW = /ui-rules-allow:\s*([a-z-]+(?:\s*,\s*[a-z-]+)*)\s+--\s*\S/;

function allows(line: string | undefined, rule: string): boolean {
	const match = line ? ALLOW.exec(line) : null;
	return !!match?.[1].split(/\s*,\s*/).includes(rule);
}

/** `path:line` of every line in `source` that breaks `rule`. */
function offendersIn(rule: RuleName, path: string, source: string): string[] {
	const { pattern, allowedUnder } = RULES[rule] as Rule;
	if (allowedUnder?.some((dir) => path.startsWith(dir))) return [];
	if (FILE_ALLOW[rule]?.[path]) return [];
	const raw = source.split("\n");
	const code = stripComments(source).split("\n");
	// An allow on the line above counts only when that line is a comment of its own (`{}` is a JSX one).
	const commentOnly = (i: number) => /^\s*\{?\s*\}?\s*$/.test(code[i] ?? "");
	return code.flatMap((line, i) =>
		pattern.test(line) && !allows(raw[i], rule) && !(commentOnly(i - 1) && allows(raw[i - 1], rule))
			? [`${path}:${i + 1}`]
			: [],
	);
}

const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root))).map((file) => ({
	path: relative(REPO, file),
	source: readFileSync(file, "utf8"),
}));

function offenders(rule: RuleName): string[] {
	return files.flatMap(({ path, source }) => offendersIn(rule, path, source));
}

const CSS_ROOTS = ["apps/capacitor/src/theme", "packages/ui/src/styles"];
type CssRule = "font-size" | "uppercase-tracked" | "transition-all";

/** The type scale in rem; px values are read at the default 16px. */
const TYPE_SCALE_REM = new Set([0.6875, 0.75, 0.875, 1, 1.125, 1.25, 1.5, 2.25]);

function offScaleFontSize(line: string): boolean {
	const size = /font-size:\s*([\d.]+)(rem|px)\b/.exec(line);
	if (!size) return false;
	const rem = size[2] === "px" ? Number(size[1]) / 16 : Number(size[1]);
	return !TYPE_SCALE_REM.has(rem);
}

/** The declarations of the rule block around line `i`. */
function blockAround(code: string[], i: number): string {
	let start = i;
	while (start > 0 && !code[start].includes("{")) start--;
	let end = i;
	while (end < code.length - 1 && !code[end].includes("}")) end++;
	return code.slice(start, end + 1).join("\n");
}

const CSS_RULES: Record<CssRule, (line: string, code: string[], i: number) => boolean> = {
	"font-size": (line) => offScaleFontSize(line),
	"transition-all": (line) => /transition(-property)?:\s*all\b/.test(line),
	"uppercase-tracked": (line, code, i) =>
		/text-transform:\s*uppercase/.test(line) &&
		Number(/letter-spacing:\s*([\d.]+)/.exec(blockAround(code, i))?.[1] ?? 0) > 0,
};

function cssOffendersIn(rule: CssRule, path: string, source: string): string[] {
	const raw = source.split("\n");
	const code = source
		.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
		.split("\n");
	const commentOnly = (i: number) => /^\s*$/.test(code[i] ?? "");
	return code.flatMap((line, i) =>
		CSS_RULES[rule](line, code, i) &&
		!allows(raw[i], rule) &&
		!(commentOnly(i - 1) && allows(raw[i - 1], rule))
			? [`${path}:${i + 1}`]
			: [],
	);
}

const cssFiles = CSS_ROOTS.flatMap((root) =>
	readdirSync(join(REPO, root))
		.filter((name) => name.endsWith(".css"))
		.map((name) => join(REPO, root, name)),
).map((file) => ({ path: relative(REPO, file), source: readFileSync(file, "utf8") }));

function cssOffenders(rule: CssRule): string[] {
	return cssFiles.flatMap(({ path, source }) => cssOffendersIn(rule, path, source));
}

describe("ui rules: the scanner", () => {
	const path = "apps/capacitor/src/pages/x.tsx";

	it("finds a breaking line and ignores one inside a comment", () => {
		const source = "const a = n.toLocaleString();\n// n.toLocaleString()\n/* Intl.NumberFormat */";
		expect(offendersIn("locale-format", path, source)).toEqual([`${path}:1`]);
	});

	it("exempts a single line with a reasoned allow comment, on it or above it", () => {
		const source = [
			"// ui-rules-allow: locale-format -- the device's own time zone, not a format",
			"const tz = Intl.DateTimeFormat().resolvedOptions();",
			"const b = n.toLocaleString(); // ui-rules-allow: locale-format -- test",
			"const c = n.toLocaleString();",
		].join("\n");
		expect(offendersIn("locale-format", path, source)).toEqual([`${path}:4`]);
	});

	it("does not exempt an allow comment without a reason, or for another rule", () => {
		const source = [
			"const a = n.toLocaleString(); // ui-rules-allow: locale-format",
			"const b = n.toLocaleString(); // ui-rules-allow: font-size -- other rule",
		].join("\n");
		expect(offendersIn("locale-format", path, source)).toEqual([`${path}:1`, `${path}:2`]);
	});

	it("lets one allow comment name several rules", () => {
		const source = [
			"// ui-rules-allow: font-size, font-weight -- SVG text",
			'<text className="font-bold text-[34px]" />',
		].join("\n");
		expect(offendersIn("font-size", path, source)).toEqual([]);
		expect(offendersIn("font-weight", path, source)).toEqual([]);
		const bare = '<text className="font-bold text-[34px]" />';
		expect(offendersIn("font-size", path, bare)).toEqual([`${path}:1`]);
		expect(offendersIn("font-weight", path, bare)).toEqual([`${path}:1`]);
	});

	it.each([
		[
			"transition-all",
			'<div className="transition-all" />',
			'<div className="transition-colors" />',
		],
		["hover-scale", '<div className="hover:scale-105" />', '<div className="hover:bg-accent" />'],
		["font-size", '<p className="text-[13px]" />', '<p className="text-2xs" />'],
		["font-weight", '<p className="font-extrabold" />', '<p className="font-semibold" />'],
		[
			"section-title",
			'<h2 className="text-xs uppercase" />',
			'<h2 className="font-medium text-sm" />',
		],
		["section-title", '<p className="book-detail-section-title" />', '<p className="text-sm" />'],
		["raw-colour", '<p className="text-amber-500" />', '<p className="text-warning" />'],
		["raw-colour", '<div className="bg-[#fff]" />', '<div className="bg-card" />'],
	] as const)("%s catches %s, but not %s", (rule, bad, good) => {
		expect(offendersIn(rule, path, `${bad}\n${good}`)).toEqual([`${path}:1`]);
	});

	it("catches an arbitrary px step and a gap off the scale (5, 12)", () => {
		const source = [
			'<div className="mx-[18px]" />',
			'<div className="-my-[7px]" />',
			'<div className="gap-5" />',
			'<div className="space-y-5" />',
			'<div className="mx-4 gap-4" />',
			'<div className="gap-12" />',
		].join("\n");
		expect(offendersIn("off-grid-spacing", path, source)).toEqual([
			`${path}:1`,
			`${path}:2`,
			`${path}:3`,
			`${path}:4`,
			`${path}:6`,
		]);
	});

	it("catches a 2.5 step and an off-scale gap or stack, but not one on the scale", () => {
		const source = [
			'<div className="px-2.5" />',
			'<div className="gap-1.5" />',
			'<div className="gap-6 py-0.5" />',
			'<ol className="space-y-0.5" />',
			'<div className="space-y-1.5" />',
			'<div className="space-y-2 space-x-4" />',
		].join("\n");
		expect(offendersIn("off-grid-spacing", path, source)).toEqual([
			`${path}:1`,
			`${path}:2`,
			`${path}:4`,
			`${path}:5`,
		]);
	});

	it("catches an arbitrary radius, but not one on the scale", () => {
		const source = [
			'<div className="rounded-[10px]" />',
			'<div className="rounded-tl-[4px]" />',
			'<div className="rounded-lg" />',
		].join("\n");
		expect(offendersIn("arbitrary-radius", path, source)).toEqual([`${path}:1`, `${path}:2`]);
	});

	it("catches uppercase with wide tracking in either order, but not a plain uppercase badge", () => {
		const source = [
			'<p className="uppercase tracking-wider" />',
			'<p className="tracking-wide text-xs uppercase" />',
			'<p className="text-xs uppercase" />',
		].join("\n");
		expect(offendersIn("uppercase-tracked", path, source)).toEqual([`${path}:1`, `${path}:2`]);
	});

	it("catches a hand-built card surface in either order, but not a pill, a bar or card.tsx", () => {
		const source = [
			'<div className="rounded-xl border border-border bg-card p-4" />',
			'<div className="bg-card p-3 border rounded-lg" />',
			'<span className="rounded-full border border-border bg-card px-3" />',
			'<div className="border-t bg-card md:rounded-xl md:border" />',
			"<div className={CARD} />",
		].join("\n");
		expect(offendersIn("card-surface", path, source)).toEqual([`${path}:1`, `${path}:2`]);
		expect(offendersIn("card-surface", "apps/capacitor/src/components/card.tsx", source)).toEqual(
			[],
		);
	});

	it("catches a named off-scale text size, but not one on the scale", () => {
		const source = [
			'<p className="text-3xl" />',
			'<p className="text-5xl" />',
			'<p className="text-4xl" />',
		];
		expect(offendersIn("font-size", path, source.join("\n"))).toEqual([`${path}:1`, `${path}:2`]);
	});

	it("catches an inline style size or margin and a hex colour string", () => {
		const style = [
			'<p style={{ fontSize: "0.7rem" }} />',
			"<p style={{ opacity: 0.6, marginTop: 2 }} />",
			"<p style={{ opacity: 0.6 }} />",
		].join("\n");
		expect(offendersIn("inline-style-type", path, style)).toEqual([`${path}:1`, `${path}:2`]);
		const hex = ['const LINE = "#c94b2a";', 'const c = themeColor("--primary");'].join("\n");
		expect(offendersIn("hex-colour", path, hex)).toEqual([`${path}:1`]);
	});

	it("catches an off-scale duration or another easing, but not the shared ones", () => {
		const source = [
			'<div className="transition-opacity duration-500" />',
			'<div className="duration-[250ms]" />',
			'<div className="ease-in-out" />',
			'<div className="transition-colors duration-200 ease-out" />',
			'<Hint hint="(ease-in multiplier)" />',
		].join("\n");
		expect(offendersIn("motion-timing", path, source)).toEqual([
			`${path}:1`,
			`${path}:2`,
			`${path}:3`,
		]);
	});

	it("catches a 7 or 10 gap, which the scale does not have", () => {
		const source = [
			'<div className="gap-7" />',
			'<div className="gap-x-10" />',
			'<div className="gap-8 p-5" />',
		];
		expect(offendersIn("off-grid-spacing", path, source.join("\n"))).toEqual([
			`${path}:1`,
			`${path}:2`,
		]);
	});

	it("exempts a whole file only through FILE_ALLOW, and a directory only through allowedUnder", () => {
		const swatch = '<div className="bg-zinc-900" />';
		expect(
			offendersIn("raw-colour", "apps/capacitor/src/components/appearance-pickers.tsx", swatch),
		).toEqual([]);
		expect(offendersIn("raw-colour", path, swatch)).toEqual([`${path}:1`]);
		const format = "const a = n.toLocaleString();";
		expect(offendersIn("locale-format", "apps/capacitor/src/utils/format-x.ts", format)).toEqual(
			[],
		);
		expect(offendersIn("locale-format", "packages/ui/src/lib/format-x.ts", format)).toEqual([]);
		expect(offendersIn("locale-format", path, format)).toEqual([`${path}:1`]);
	});

	it("every whole-file exemption names a file that exists and a reason", () => {
		for (const exemptions of Object.values(FILE_ALLOW)) {
			for (const [file, reason] of Object.entries(exemptions ?? {})) {
				expect(
					files.some((f) => f.path === file),
					file,
				).toBe(true);
				expect(reason.trim().length, file).toBeGreaterThan(0);
			}
		}
	});

	it("catches theme CSS: off-scale font sizes, uppercase with tracking and transition all", () => {
		const css = "x.css";
		const source = [
			".a {",
			"\tfont-size: 0.7rem;",
			"\tfont-size: 0.75rem;",
			"\tfont-size: 13px;",
			"\tfont-size: 1em;",
			"\tfont-size: 0.8rem; /* ui-rules-allow: font-size -- reader */",
			"}",
			".b {",
			"\ttext-transform: uppercase;",
			"\tletter-spacing: 0.08em;",
			"\ttransition: all 0.2s;",
			"}",
			".c {",
			"\ttext-transform: uppercase;",
			"\tletter-spacing: normal;",
			"\ttransition: opacity 0.2s;",
			"}",
		].join("\n");
		expect(cssOffendersIn("font-size", css, source)).toEqual([`${css}:2`, `${css}:4`]);
		expect(cssOffendersIn("uppercase-tracked", css, source)).toEqual([`${css}:9`]);
		expect(cssOffendersIn("transition-all", css, source)).toEqual([`${css}:11`]);
	});

	it("keeps a URL in a string as code", () => {
		const source = 'const u = "https://x.org"; n.toLocaleString();';
		expect(offendersIn("locale-format", path, source)).toEqual([`${path}:1`]);
	});
});

describe("ui rules (LESE-215)", () => {
	it("numbers and dates are formatted only by the shared formatters in utils", () => {
		expect(offenders("locale-format")).toEqual([]);
	});

	it("transitions name their properties, keep the shared easing and timings, and nothing grows on hover", () => {
		expect([
			...offenders("transition-all"),
			...offenders("hover-scale"),
			...offenders("motion-timing"),
		]).toEqual([]);
	});

	it("interface type uses the type scale and the 400, 500 and 600 weights", () => {
		expect([...offenders("font-size"), ...offenders("font-weight")]).toEqual([]);
	});

	it("spacing stays on the 4px grid: no arbitrary px, no half steps above 2, gaps on the scale", () => {
		expect(offenders("off-grid-spacing")).toEqual([]);
	});

	it("card surfaces come from card.tsx, never rebuilt by hand", () => {
		expect(offenders("card-surface")).toEqual([]);
	});

	it("inline styles set no type or margin, and colours are tokens, never a hex string", () => {
		expect([...offenders("inline-style-type"), ...offenders("hex-colour")]).toEqual([]);
	});

	it("theme CSS keeps the type scale, sentence case and named transitions", () => {
		expect([
			...cssOffenders("font-size"),
			...cssOffenders("uppercase-tracked"),
			...cssOffenders("transition-all"),
		]).toEqual([]);
	});

	it("radii come from the radius scale, never an arbitrary value", () => {
		expect(offenders("arbitrary-radius")).toEqual([]);
	});

	it("captions and eyebrows are sentence case, never uppercase with wide tracking", () => {
		expect(offenders("uppercase-tracked")).toEqual([]);
	});

	it("section titles share one style, in sentence case", () => {
		expect(offenders("section-title")).toEqual([]);
	});

	it("status and accent colours come from theme tokens, never a raw palette or hex class", () => {
		expect(offenders("raw-colour")).toEqual([]);
	});
});
