import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingSession } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";
import { UNDO_WINDOW_MS } from "../stats/use-undoable-delete";

const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();

const state = {
	rows: [] as ReadingSession[],
	all: [] as ReadingSession[],
	mutateAsync: vi.fn(async (_ids: string[]) => {}),
	toast: vi.fn(),
};

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBookReadingSessions: () => ({ data: state.rows, isLoading: false }),
		useAllReadingSessions: () => ({ data: state.all, isLoading: false }),
		useDeleteReadingSessions: () => ({ mutateAsync: state.mutateAsync }),
		useUpdateReadingSession: () => ({ mutate: vi.fn(), isPending: false }),
	},
}));
vi.mock("../../../services/db/queries", () => ({
	queries: { getAllReadingSessions: async () => state.all },
}));
vi.mock("../../../components/toast", () => ({
	toast: { success: (...args: unknown[]) => state.toast(...args), error: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, search }: { children: React.ReactNode; search: unknown }) => (
		<a href="#stats" data-search={JSON.stringify(search)}>
			{children}
		</a>
	),
}));

const { BookSessions, BOOK_SESSIONS_SHOWN } = await import("../book-sessions");

const book = makeBook({ id: "mm", title: "Middlemarch", wordCount: 10_000 });

function session(id: string, startedAt: number, bookId = "mm"): ReadingSession {
	return {
		id,
		bookId,
		mode: "scroll",
		startedAt,
		endedAt: startedAt + 600_000,
		durationMs: 600_000,
		wordsRead: 2_500,
		startWord: 1_000,
		endWord: 3_500,
		furthestWord: 3_500,
		wpmAvg: 250,
		updatedAt: startedAt,
	} as ReadingSession;
}

function longPress(el: Element) {
	const touch = (type: "touchstart" | "touchend", fingers: number) => {
		const event = new TouchEvent(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, "touches", { value: Array.from({ length: fingers }, () => ({})) });
		act(() => {
			el.dispatchEvent(event);
		});
	};
	touch("touchstart", 1);
	act(() => {
		vi.advanceTimersByTime(500);
	});
	touch("touchend", 0);
	act(() => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	state.mutateAsync.mockClear();
	state.toast.mockClear();
	vi.useRealTimers();
});

async function show() {
	view = await render(<BookSessions book={book} />);
	await flush();
	return view;
}

function confirmButton(label: string): HTMLElement {
	const found = [...document.body.querySelectorAll("button")].find((b) => b.textContent === label);
	if (!found) throw new Error(`no ${label} button`);
	return found;
}

const rowButtons = (v: Rendered) => [
	...v.container.querySelectorAll<HTMLElement>("li > button:first-child"),
];

describe("BookSessions", () => {
	it("lists the book's latest sessions under their days, linking to all of them in Stats", async () => {
		state.rows = Array.from({ length: 12 }, (_, i) =>
			session(`s${i}`, at(7 - Math.floor(i / 4), 18 - i)),
		);
		const v = await show();
		expect(v.text()).toContain("Sessions · 12");
		expect(rowButtons(v)).toHaveLength(BOOK_SESSIONS_SHOWN);
		expect(v.container.querySelectorAll("section[aria-label] section")).toHaveLength(3);
		expect(v.text()).toContain("10% → 35%");
		const link = v.container.querySelector("a");
		expect(link?.textContent).toBe("See all 12");
		expect(JSON.parse(link?.getAttribute("data-search") ?? "")).toEqual({
			tab: "sessions",
			book: "mm",
		});
	});

	it("shows nothing for a book without sessions", async () => {
		state.rows = [];
		expect((await show()).text()).toBe("");
	});

	it("asks before Delete all even for a few, warning about the streak only when no other book was read that day, and deletes at once", async () => {
		state.rows = [session("a", at(7, 9)), session("b", at(6, 9))];
		state.all = [...state.rows, session("x", at(7, 12), "em")];
		const v = await show();

		await click(v.getButton("Delete all 2 sessions"));
		await flush();
		expect(state.toast).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Delete 2 sessions of Middlemarch?");
		expect(document.body.textContent).toContain("Streak may change.");
		await click(confirmButton("Delete 2"));
		// No undo window: the stats and journey cards recount as soon as the rows are gone.
		expect(state.mutateAsync).toHaveBeenCalledWith(["a", "b"]);

		view?.unmount();
		state.rows = [session("a", at(7, 9))];
		state.all = [...state.rows, session("x", at(7, 12), "em")];
		await click((await show()).getButton("Delete all 1 session"));
		await flush();
		expect(document.body.textContent).toContain("Delete 1 session of Middlemarch?");
		expect(document.body.textContent).not.toContain("Streak may change.");
	});

	it("asks once when Delete all is tapped again while the streak check is still loading", async () => {
		state.rows = [session("a", at(7, 9))];
		state.all = state.rows;
		const v = await show();
		const button = v.getButton("Delete all 1 session");
		act(() => {
			button.click();
			button.click();
		});
		await flush();
		await click(confirmButton("Delete 1"));
		expect(state.mutateAsync).toHaveBeenCalledTimes(1);
	});

	it("asks before deleting five or more, and deletes on confirm", async () => {
		state.rows = Array.from({ length: 6 }, (_, i) => session(`s${i}`, at(7, 8 + i)));
		state.all = state.rows;
		await click((await show()).getButton("Delete all 6 sessions"));
		await flush();
		expect(state.toast).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Delete 6 sessions of Middlemarch?");
		await click(confirmButton("Delete 6"));
		expect(state.mutateAsync).toHaveBeenCalledWith(["s0", "s1", "s2", "s3", "s4", "s5"]);
	});

	it("opens a row's detail on a tap and selects on a long press, then deletes the selection", async () => {
		state.rows = [session("a", at(7, 10)), session("b", at(7, 9)), session("c", at(6, 9))];
		state.all = state.rows;
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const v = await show();
		const [first, second, third] = rowButtons(v);
		if (!first || !second || !third) throw new Error("no rows");

		await click(first);
		expect(document.body.textContent).toContain("Duration (minutes)");
		expect(document.body.textContent).not.toContain("Open book");
		expect(document.body.textContent).not.toContain("Only this book");
		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		longPress(second);
		expect(v.text()).toContain("1 selected");
		expect(document.body.textContent).not.toContain("Same book");
		await click(third);
		expect(v.text()).toContain("2 selected");
		await click(v.getButton("Delete 2"));
		await flush();
		expect(state.toast).toHaveBeenCalledWith(
			"2 sessions deleted · Streak may change",
			expect.anything(),
		);
		expect(v.container.querySelector("[role=toolbar]")).toBeNull();
		await act(async () => {
			vi.advanceTimersByTime(UNDO_WINDOW_MS);
		});
		expect(state.mutateAsync.mock.calls[0]?.[0].slice().sort()).toEqual(["b", "c"]);
	});
});
