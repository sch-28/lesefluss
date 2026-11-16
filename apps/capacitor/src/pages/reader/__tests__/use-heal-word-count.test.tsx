import { useQuery } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

/** The row's word_count. The query itself is tested against real SQLite in
 *  services/db/__tests__/word-count-backfill.test.ts; this file runs in a DOM. */
let row: number | null = null;
const setMissingWordCount = vi.fn(async (_id: string, wordCount: number) => {
	if (row === 0) row = wordCount;
});
vi.mock("../../../services/db/queries", () => ({ queries: { setMissingWordCount } }));

const { bookKeys } = await import("../../../services/db/hooks/query-keys");
const { bookWordTotal, useHealWordCount } = await import("../use-heal-word-count");

function storedCount(): number | null {
	return row;
}

let shownCount: number | null | undefined;

function Probe({ stored, indexed }: { stored: number | undefined; indexed: number | undefined }) {
	useHealWordCount("b1", stored, indexed);
	// Stands in for the library and goal views, which read the row through this key.
	shownCount = useQuery({
		queryKey: bookKeys.detail("b1"),
		queryFn: async () => storedCount(),
	}).data;
	return null;
}

let view: Rendered | undefined;

async function renderProbe(stored: number | undefined, indexed: number | undefined) {
	view = await render(<Probe stored={stored} indexed={indexed} />);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

beforeEach(() => {
	row = null;
	shownCount = undefined;
	setMissingWordCount.mockClear();
});

afterEach(() => {
	view?.unmount();
	view = undefined;
});

function insertBook(wordCount: number) {
	row = wordCount;
}

describe("bookWordTotal", () => {
	it("falls back to the counted words when the stored count is 0", () => {
		expect(bookWordTotal(0, 5000)).toBe(5000);
	});

	it("prefers the stored count", () => {
		expect(bookWordTotal(4000, 5000)).toBe(4000);
	});

	it("is 0 when nothing is known", () => {
		expect(bookWordTotal(undefined, undefined)).toBe(0);
	});
});

describe("useHealWordCount", () => {
	it("stores the counted words of a book that kept 0 and refreshes its views", async () => {
		insertBook(0);

		await renderProbe(0, 5000);

		expect(storedCount()).toBe(5000);
		expect(shownCount).toBe(5000);
	});

	it("leaves a counted book alone", async () => {
		insertBook(4000);

		await renderProbe(4000, 5000);

		expect(storedCount()).toBe(4000);
		expect(setMissingWordCount).not.toHaveBeenCalled();
	});

	it("waits for the book row and for a word index with words", async () => {
		insertBook(0);

		await renderProbe(undefined, 5000);
		view?.unmount();
		await renderProbe(0, undefined);
		view?.unmount();
		await renderProbe(0, 0);

		expect(setMissingWordCount).not.toHaveBeenCalled();
	});
});
