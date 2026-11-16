import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
		return path.endsWith(".tsx") ? [path] : [];
	});
}

/** Every `<Button …>` opening tag of the app, with its file and className string. */
function buttonTags(): { where: string; className: string }[] {
	return sourceFiles(SRC).flatMap((file) => {
		const source = readFileSync(file, "utf8");
		return [...source.matchAll(/<Button\b([^>]|=>)*?>/g)].map((match) => ({
			where: `${relative(SRC, file)}:${source.slice(0, match.index).split("\n").length}`,
			className: match[0].match(/className="([^"]*)"/)?.[1] ?? "",
		}));
	});
}

describe("Button rules (LESE-211.9)", () => {
	it("no Button sets a height or radius of its own", () => {
		const offenders = buttonTags().filter(({ className }) =>
			/(^|\s)(md:)?(h-\d|min-h-1[1-9]|rounded-)/.test(className),
		);
		expect(offenders.map((o) => o.where)).toEqual([]);
	});

	it("a full-width Button goes back to its label width on desktop", () => {
		const offenders = buttonTags().filter(
			({ className }) =>
				/(^|\s)(w-full|flex-1|flex-\[[^\]]+\])(\s|$)/.test(className) &&
				!/(^|\s)md:(w-fit|w-auto|flex-none)(\s|$)/.test(className),
		);
		expect(offenders.map((o) => o.where)).toEqual([]);
	});
});
