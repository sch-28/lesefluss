import { wordPos } from "@lesefluss/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingSession } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";

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

const { BookDangerZone } = await import("../book-danger-zone");

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

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	state.mutateAsync.mockClear();
	state.toast.mockClear();
});

const onResetProgress = vi.fn();
const onDeleteBook = vi.fn();

async function show(target = book) {
	view = await render(
		<BookDangerZone book={target} onResetProgress={onResetProgress} onDeleteBook={onDeleteBook} />,
	);
	await flush();
	return view;
}

function confirmButton(label: string): HTMLElement {
	const found = [...document.body.querySelectorAll("button")].find((b) => b.textContent === label);
	if (!found) throw new Error(`no ${label} button`);
	return found;
}

describe("BookDangerZone", () => {
	it("holds Reset progress, Delete all sessions and Delete book", async () => {
		state.rows = [session("a", at(7, 9))];
		state.all = state.rows;
		const v = await show(makeBook({ id: "mm", title: "Middlemarch", wordPosition: wordPos(500) }));
		expect([...v.container.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
			"Reset progress",
			"Delete all 1 session",
			"Delete book",
		]);
		await click(v.getButton("Reset progress"));
		await click(v.getButton("Delete book"));
		expect(onResetProgress).toHaveBeenCalledOnce();
		expect(onDeleteBook).toHaveBeenCalledOnce();
	});

	it("offers only Delete book for an unread book without sessions", async () => {
		state.rows = [];
		const v = await show();
		expect([...v.container.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
			"Delete book",
		]);
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
});
