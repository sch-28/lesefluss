import type React from "react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";

const scrollToIndex = vi.fn();
const chapterData: { current: Book[] } = { current: [] };

vi.mock("virtua", () => ({
	VList: forwardRef<unknown, { children: React.ReactNode }>(({ children }, ref) => {
		useImperativeHandle(ref, () => ({ scrollToIndex }));
		return <div>{children}</div>;
	}),
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useSeriesChapters: () => ({ data: chapterData.current, isPending: false }),
	},
}));

const { SeriesChapterList } = await import("../series-chapter-list");

const chapters = (count: number) =>
	Array.from({ length: count }, (_, i) =>
		makeBook({ id: `ch-${i}`, title: `Chapter ${i + 1}`, seriesId: "s", chapterIndex: i }),
	);

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

describe("SeriesChapterList", () => {
	it("marks and scrolls to the chapter open in the reader, with one row of context", async () => {
		chapterData.current = chapters(40);
		view = await render(<SeriesChapterList seriesId="s" currentBookId="ch-25" />);
		const current = view.container.querySelectorAll("[aria-current]");
		expect(current).toHaveLength(1);
		expect(current[0].textContent).toContain("Chapter 26");
		expect(scrollToIndex).toHaveBeenCalledExactlyOnceWith(24, { align: "start" });
	});

	it("does not re-scroll when the chapter list refreshes", async () => {
		chapterData.current = chapters(40);
		view = await render(<SeriesChapterList seriesId="s" currentBookId="ch-25" />);
		chapterData.current = chapters(41);
		await view.rerender(<SeriesChapterList seriesId="s" currentBookId="ch-25" />);
		expect(scrollToIndex).toHaveBeenCalledTimes(1);
	});

	it("neither marks nor scrolls without a current book", async () => {
		chapterData.current = chapters(40);
		view = await render(<SeriesChapterList seriesId="s" />);
		expect(view.container.querySelector("[aria-current]")).toBeNull();
		expect(scrollToIndex).not.toHaveBeenCalled();
	});
});
