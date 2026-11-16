import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../../../services/db/schema";
import { type Rendered, render } from "../../../test/render";
import type { ReaderApi, UserNavigateSource } from "../reader-api/types";

let bookmarks: Bookmark[] = [];
const toggleMutate = vi.fn();

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBookmarks: () => ({ data: bookmarks }),
		useToggleBookmark: () => ({ mutate: toggleMutate }),
	},
}));

const { hasBookmarkOnScreen, lastAtOrBefore, nextBookmarkWord, useReaderBookmarks } = await import(
	"../use-reader-bookmarks"
);

function mark(word: number): Bookmark {
	return {
		id: `m${word}`,
		bookId: "b1",
		word,
		label: null,
		deleted: false,
		createdAt: 0,
		updatedAt: 0,
	} as Bookmark;
}

function fakeReader(initial: { first: number; last: number } | null, current = 0) {
	let visible = initial;
	let word = current;
	const listeners = new Set<(word: number, source: UserNavigateSource) => void>();
	const api: ReaderApi = {
		mode: "scroll",
		goToWord: vi.fn(),
		visibleWords: () => visible,
		rectsFor: () => [],
		onUserNavigate(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		currentWord: () => word,
	};
	return {
		api,
		/** The view moves without reporting it, as a far jump landing inside its settle guard does. */
		landSilently(next: { first: number; last: number }) {
			visible = next;
		},
		/** The view moves to a new range, then reports the move as a reader does. */
		moveTo(next: { first: number; last: number }) {
			visible = next;
			word = next.first;
			for (const cb of listeners) cb(next.first, "settle");
		},
	};
}

type Result = ReturnType<typeof useReaderBookmarks>;
let result: Result;
function Harness({ api, isViewReady = true }: { api: ReaderApi; isViewReady?: boolean }) {
	result = useReaderBookmarks("b1", api, isViewReady);
	return null;
}

let rendered: Rendered;
async function settle() {
	await act(async () => {
		vi.advanceTimersByTime(1000);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	bookmarks = [];
	toggleMutate.mockClear();
});

afterEach(() => {
	rendered?.unmount();
	vi.useRealTimers();
});

describe("nextBookmarkWord", () => {
	it("takes the first bookmark after the current word and wraps to the first", () => {
		expect(nextBookmarkWord([10, 80], 0)).toBe(10);
		expect(nextBookmarkWord([10, 80], 10)).toBe(80);
		expect(nextBookmarkWord([10, 80], 50)).toBe(80);
		expect(nextBookmarkWord([10, 80], 80)).toBe(10);
		expect(nextBookmarkWord([10, 80], 99)).toBe(10);
	});

	it("is null without bookmarks", () => {
		expect(nextBookmarkWord([], 5)).toBeNull();
	});
});

describe("hasBookmarkOnScreen", () => {
	it("counts both edges of the visible range", () => {
		expect(hasBookmarkOnScreen([mark(10)], { first: 10, last: 20 })).toBe(true);
		expect(hasBookmarkOnScreen([mark(20)], { first: 10, last: 20 })).toBe(true);
		expect(hasBookmarkOnScreen([mark(21)], { first: 10, last: 20 })).toBe(false);
		expect(hasBookmarkOnScreen([mark(10)], null)).toBe(false);
	});
});

describe("lastAtOrBefore", () => {
	it("finds the last item at or before the word", () => {
		const items = [{ w: 0 }, { w: 10 }, { w: 20 }];
		expect(lastAtOrBefore(items, 15, (i) => i.w)).toEqual({ w: 10 });
		expect(lastAtOrBefore(items, 20, (i) => i.w)).toEqual({ w: 20 });
		expect(lastAtOrBefore(items.slice(1), 5, (i) => i.w)).toBeUndefined();
	});
});

describe("useReaderBookmarks", () => {
	it("fills once the view is ready with a bookmark on screen, and follows the user's moves", async () => {
		bookmarks = [mark(15)];
		const reader = fakeReader({ first: 10, last: 20 });
		rendered = await render(<Harness api={reader.api} />);
		await settle();
		expect(result.isOnScreen).toBe(true);

		act(() => reader.moveTo({ first: 30, last: 40 }));
		await settle();
		expect(result.isOnScreen).toBe(false);
	});

	it("re-reads the screen at a scroll end no user move reported", async () => {
		bookmarks = [mark(75)];
		const reader = fakeReader({ first: 10, last: 20 });
		rendered = await render(<Harness api={reader.api} />);
		await settle();
		expect(result.isOnScreen).toBe(false);

		reader.landSilently({ first: 70, last: 80 });
		const view = document.createElement("div");
		document.body.appendChild(view);
		act(() => {
			view.dispatchEvent(new Event("scrollend"));
		});
		await settle();
		view.remove();
		expect(result.isOnScreen).toBe(true);
	});

	it("does not read the view before it is ready", async () => {
		bookmarks = [mark(15)];
		const reader = fakeReader({ first: 10, last: 20 });
		rendered = await render(<Harness api={reader.api} isViewReady={false} />);
		await settle();
		expect(result.isOnScreen).toBe(false);
	});

	it("toggles over the words on screen and never moves the reader", async () => {
		const reader = fakeReader({ first: 10, last: 20 });
		rendered = await render(<Harness api={reader.api} />);
		act(() => result.toggle());
		expect(toggleMutate).toHaveBeenCalledWith({ bookId: "b1", from: 10, to: 20 });
		expect(reader.api.goToWord).not.toHaveBeenCalled();
	});

	it("does not toggle before the view has laid out", async () => {
		const reader = fakeReader(null);
		rendered = await render(<Harness api={reader.api} />);
		act(() => result.toggle());
		expect(toggleMutate).not.toHaveBeenCalled();
	});

	it("goes to the next bookmark after the current word, wrapping, and stays put without any", async () => {
		const reader = fakeReader({ first: 50, last: 60 }, 50);
		rendered = await render(<Harness api={reader.api} />);
		act(() => result.goToNext());
		expect(reader.api.goToWord).not.toHaveBeenCalled();

		bookmarks = [mark(10), mark(80)];
		await rendered.rerender(<Harness api={reader.api} />);
		act(() => result.goToNext());
		expect(reader.api.goToWord).toHaveBeenLastCalledWith(80);

		act(() => reader.moveTo({ first: 90, last: 99 }));
		act(() => result.goToNext());
		expect(reader.api.goToWord).toHaveBeenLastCalledWith(10);
	});
});
