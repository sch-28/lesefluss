import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingSession } from "../../../../services/db/schema";
import { makeBook } from "../../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../../test/render";
import { UNDO_WINDOW_MS } from "../use-undoable-delete";

const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
const NOW = at(7, 20);

const state = {
	rows: [] as ReadingSession[],
	mutateAsync: vi.fn(async (_ids: string[]) => {}),
	toast: vi.fn(),
};

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useAllReadingSessions: () => ({ data: state.rows, isPending: false }),
		useDeleteReadingSessions: () => ({ mutateAsync: state.mutateAsync }),
	},
}));
vi.mock("../../../../services/db/queries", () => ({
	queries: {
		getAllBooks: async () => [
			makeBook({ id: "mm", title: "Middlemarch", wordCount: 10_000 }),
			makeBook({ id: "em", title: "Emma" }),
		],
	},
}));
vi.mock("../../../../components/toast", () => ({
	toast: { success: (...args: unknown[]) => state.toast(...args), error: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: vi.fn() }),
	Link: () => null,
}));

const { SessionsTab } = await import("../sessions-tab");

function session(id: string, bookId: string, startedAt: number): ReadingSession {
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

function touch(el: Element, type: "touchstart" | "touchend", fingers: number) {
	const event = new TouchEvent(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "touches", { value: Array.from({ length: fingers }, () => ({})) });
	act(() => {
		el.dispatchEvent(event);
	});
}

function longPress(el: Element) {
	touch(el, "touchstart", 1);
	act(() => {
		vi.advanceTimersByTime(500);
	});
	touch(el, "touchend", 0);
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

async function show(bookId?: string) {
	view = await render(<SessionsTab now={NOW} bookId={bookId} onBookChange={() => {}} />);
	await flush();
	return view;
}

describe("SessionsTab", () => {
	it("groups every book's sessions under their days, with the totals", async () => {
		state.rows = [
			session("a", "mm", at(7, 9)),
			session("b", "em", at(6, 9)),
			session("c", "mm", at(3, 9)),
		];
		const text = (await show()).text();
		expect(text).toContain("3 · 30m");
		expect(text).toMatch(/Today10m.*Middlemarch.*Yesterday10m.*Emma/);
	});

	it("shows an RSVP sitting's delivered speed, not its dial", async () => {
		state.rows = [{ ...session("a", "mm", at(7, 9)), mode: "rsvp", wordsRead: 3_800, wpmAvg: 400 }];
		const text = (await show()).text();
		expect(text).toContain("380 wpm");
		expect(text).not.toContain("400 wpm");
	});

	it("shows a book's card with the position range and deletes a few at once, with undo", async () => {
		state.rows = [
			session("a", "mm", at(7, 9)),
			session("b", "mm", at(6, 9)),
			session("c", "em", at(6, 10)),
			session("d", "em", at(7, 10)),
		];
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const v = await show("mm");
		expect(v.text()).toContain("2 sessions · 20m · 250 wpm");
		expect(v.text()).toContain("10% → 35%");
		expect(v.text()).not.toContain("Emma");

		await click(v.getButton("Delete all 2 sessions"));
		expect(state.toast).toHaveBeenCalledWith("2 sessions deleted", {
			action: { label: "Undo", onClick: expect.any(Function) },
			duration: UNDO_WINDOW_MS,
		});
		expect(v.text()).toContain("No sessions");
		expect(state.mutateAsync).not.toHaveBeenCalled();
		await act(async () => {
			vi.advanceTimersByTime(UNDO_WINDOW_MS);
		});
		expect(state.mutateAsync).toHaveBeenCalledWith(["a", "b"]);
	});

	it("warns that the streak may change when a deleted session was the day's only one", async () => {
		state.rows = [session("a", "mm", at(7, 9)), session("b", "em", at(7, 10))];
		await click((await show("mm")).getButton("Delete all 1 session"));
		expect(state.toast).toHaveBeenCalledWith("1 session deleted", expect.anything());

		view?.unmount();
		state.rows = [session("a", "mm", at(7, 9)), session("b", "em", at(6, 10))];
		await click((await show("mm")).getButton("Delete all 1 session"));
		expect(state.toast).toHaveBeenLastCalledWith(
			"1 session deleted · Streak may change",
			expect.anything(),
		);
	});

	it("asks before deleting five or more, and deletes on confirm", async () => {
		state.rows = Array.from({ length: 5 }, (_, i) => session(`s${i}`, "mm", at(7, 8 + i)));
		await click((await show("mm")).getButton("Delete all 5 sessions"));
		expect(state.toast).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Delete 5 sessions of Middlemarch?");
		expect(document.body.textContent).toContain(
			"50m of reading is removed here and on your other devices after sync.",
		);
		const confirm = [...document.body.querySelectorAll("button")].find(
			(b) => b.textContent === "Delete 5",
		);
		if (!confirm) throw new Error("no confirm button");
		await click(confirm);
		expect(state.mutateAsync).toHaveBeenCalledWith(["s0", "s1", "s2", "s3", "s4"]);
	});

	it("opens a row's menu on a tap and selects on a long press, as in the library grid", async () => {
		state.rows = [session("a", "mm", at(7, 9)), session("b", "mm", at(7, 10))];
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const v = await show();
		const row = v.container.querySelector<HTMLElement>("li > button:first-child");
		if (!row) throw new Error("no row");

		await click(row);
		expect(document.body.textContent).toContain("Delete session");
		expect(v.text()).not.toContain("selected");

		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		longPress(row);
		expect(v.text()).toContain("1 selected");
	});

	it("selects rows by long press and taps, widens to the same book, and deletes the selection", async () => {
		state.rows = [
			session("e", "em", at(7, 11)),
			session("b", "mm", at(7, 10)),
			session("a", "mm", at(7, 9)),
			session("c", "mm", at(6, 9)),
			session("d", "mm", at(5, 9)),
		];
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const v = await show();
		const row = (i: number) => {
			const el = v.container.querySelectorAll("li > button:first-child")[i];
			if (!el) throw new Error(`no row ${i}`);
			return el as HTMLElement;
		};

		longPress(row(1));
		expect(v.text()).toContain("1 selected");
		await click(v.getButton("Select all 5"));
		expect(v.text()).toContain("5 selected");
		await click(v.getButton("Deselect all"));
		expect(v.text()).toContain("0 selected");

		await click(row(0));
		await click(row(1));
		await click(row(0));
		expect(v.text()).toContain("1 selected");
		await click(v.getButton("Same book"));
		expect(v.text()).toContain("4 selected");

		await click(v.getButton("Delete 4"));
		expect(state.toast).toHaveBeenCalledWith(
			"4 sessions deleted · Streak may change",
			expect.anything(),
		);
		expect(v.container.querySelector("[role=toolbar]")).toBeNull();
		expect(v.text()).not.toContain("Middlemarch");
		await act(async () => {
			vi.advanceTimersByTime(UNDO_WINDOW_MS);
		});
		expect(state.mutateAsync.mock.calls[0]?.[0].slice().sort()).toEqual(["a", "b", "c", "d"]);
	});
});
