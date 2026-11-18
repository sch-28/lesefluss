import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

/** Screens whose empty or failed state is the page's only content, with the state's title. */
const PAGE_STATES: [file: string, marker: string][] = [
	["pages/library/stats/empty-state.tsx", 'title="No stats yet"'],
	["routes/tabs/settings/export.tsx", 'title="No highlights yet"'],
	["pages/library/index.tsx", 'title="No books yet"'],
	["pages/library/index.tsx", 'title="No books in this collection yet"'],
	["pages/explore/landing.tsx", "<ErrorState"],
];

/** The JSX element that opens at `marker` or encloses it, up to its first `>` after the marker. */
function openingTag(source: string, marker: string): string {
	const at = source.indexOf(marker);
	expect(at, marker).toBeGreaterThan(-1);
	const start = marker.startsWith("<") ? at : source.lastIndexOf("<", at);
	return source.slice(start, source.indexOf(">", at));
}

describe("page-level empty states", () => {
	it.each(PAGE_STATES)("%s renders %s as a centred shared EmptyState", (file, marker) => {
		const tag = openingTag(readFileSync(resolve(SRC, file), "utf8"), marker);
		expect(tag).toMatch(/^<(SharedEmptyState|EmptyState|ErrorState)\b/);
		expect(tag).toMatch(/\spage(?!={false})\b/);
	});

	it("no page keeps its own height workaround for its empty state", () => {
		for (const file of ["pages/library/index.tsx", "pages/explore/grouped-results.tsx"]) {
			const source = readFileSync(resolve(SRC, file), "utf8");
			expect(source, file).not.toMatch(/min-h-\[\d+vh\]/);
		}
	});

	it("Stats Overview gives the goal card and the empty state the page height together", () => {
		const source = readFileSync(resolve(SRC, "pages/library/stats.tsx"), "utf8");
		expect(source).toMatch(
			/<FillFreeHeight className={cn\("flex flex-col", EMPTY_STATE_PAGE\)}>\s*<TodayGoalCard \/>\s*<EmptyState page={false} className="flex-1" \/>/,
		);
	});
});
