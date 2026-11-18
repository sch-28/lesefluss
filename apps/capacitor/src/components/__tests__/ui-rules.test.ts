import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The handbook's greppable ui_rules (LESE-215). A line breaks a rule unless it, or the line
 *  above it, carries `ui-rules-allow: <rule> -- <reason>`, or its file is in FILE_ALLOW. */

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
	"font-size": { pattern: /\btext-\[[0-9.]/ },
	"font-weight": { pattern: /\bfont-(bold|extrabold|black)\b/ },
	"off-grid-spacing": {
		pattern:
			/(^|[\s"'`:])-?(?:(m|p|gap|space)[trblxyse]?-(x-|y-)?(\[-?\d+(\.\d+)?px\]|([2-9]|1\d)\.5\b)|(gap|space)(-[xy])?-(0\.5|1\.5|5)\b)/,
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
} satisfies Record<string, Rule>;

type RuleName = keyof typeof RULES;

/** Files a rule exempts as a whole, each with its reason. */
const FILE_ALLOW: Partial<Record<RuleName, Record<string, string>>> = {
	"uppercase-tracked": {
		"apps/capacitor/src/pages/reader/goal-chip.tsx":
			"the reader's goal chip is uppercase by choice (4edc879d)",
		"apps/capacitor/src/pages/library/reading-goal/goal-stat.tsx":
			"only the reader's goal chip uses it",
		"apps/capacitor/src/pages/reader/annotations-sheet.tsx": "the reader stays as it is (LESE-215)",
		"apps/capacitor/src/components/selection-popover.tsx":
			"the reader's selection toolbar stays as it is",
		"apps/capacitor/src/pages/reader/dictionary-modal.tsx": "the reader stays as it is (LESE-215)",
		"apps/capacitor/src/pages/settings/reader-preview.tsx":
			"it previews the reader, which stays as it is",
		"apps/capacitor/src/components/social/buddy-read-trailer.tsx":
			"it mirrors the share card's printed trailer",
		"apps/capacitor/src/components/device-sync/device-badge.tsx": "a badge, not a caption",
		"apps/capacitor/src/pages/library/book-chapters.tsx": "the Here badge, not a caption",
		"apps/capacitor/src/pages/library/stats/session-list.tsx": "a mode badge, not a caption",
		"apps/capacitor/src/pages/explore/web-novel-search-panel.tsx": "a badge, not a caption",
	},
	"raw-colour": {
		"apps/capacitor/src/components/appearance-pickers.tsx":
			"theme swatches show each theme's own colours, whatever theme is active",
		"apps/capacitor/src/pages/library/book-highlights.tsx":
			"the user's highlight colours, the same in every theme",
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

	it("keeps a URL in a string as code", () => {
		const source = 'const u = "https://x.org"; n.toLocaleString();';
		expect(offendersIn("locale-format", path, source)).toEqual([`${path}:1`]);
	});
});

describe("ui rules (LESE-215)", () => {
	it("numbers and dates are formatted only by the shared formatters in utils", () => {
		expect(offenders("locale-format")).toEqual([]);
	});

	it("transitions name their properties and nothing grows on hover", () => {
		expect([...offenders("transition-all"), ...offenders("hover-scale")]).toEqual([]);
	});

	it("interface type uses the type scale and the 400, 500 and 600 weights", () => {
		expect([...offenders("font-size"), ...offenders("font-weight")]).toEqual([]);
	});

	it("spacing stays on the 4px grid: no arbitrary px, no half steps above 2, gaps on the scale", () => {
		expect(offenders("off-grid-spacing")).toEqual([]);
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
