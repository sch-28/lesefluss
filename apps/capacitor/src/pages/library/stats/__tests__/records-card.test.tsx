import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingSession } from "../../../../services/db/schema";
import { makeBook } from "../../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../../test/render";
import { UNDO_WINDOW_MS } from "../use-undoable-delete";

const mutateAsync = vi.fn();
const toastSuccess = vi.fn();
const longestBookFinished: { current: { words: number; title: string } | null } = { current: null };

const sitting = {
	id: "long",
	bookId: "mm",
	mode: "scroll",
	startedAt: new Date(2026, 10, 7, 20).getTime(),
	endedAt: new Date(2026, 10, 7, 22).getTime(),
	durationMs: 7_200_000,
	wordsRead: 30_000,
	startWord: 0,
	endWord: 30_000,
	furthestWord: 30_000,
	wpmAvg: 250,
	updatedAt: 0,
} as ReadingSession;

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsRecords: () => ({
			data: {
				longestSitting: {
					sessionId: "long",
					durationMs: 7_200_000,
					at: sitting.startedAt,
					title: "Middlemarch",
				},
				bestDay: { durationMs: 7_200_000, dayStart: sitting.startedAt },
				fastestBook: null,
				longestBookFinished: longestBookFinished.current,
			},
		}),
		useAllReadingSessions: () => ({ data: [sitting], isPending: false }),
		useBook: (id: string) => ({
			data: id === "mm" ? makeBook({ id: "mm", title: "Middlemarch" }) : undefined,
		}),
		useDeleteReadingSessions: () => ({ mutateAsync }),
		useUpdateReadingSession: () => ({ mutate: vi.fn(), isPending: false }),
	},
}));
vi.mock("../../../../services/db/queries", () => ({
	queries: { getAllReadingSessions: async () => [] },
}));
vi.mock("../../../../components/toast", () => ({
	toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: vi.fn() }),
	useNavigate: () => vi.fn(),
	Link: () => null,
}));

const { RecordsCard } = await import("../records-card");

let view: Rendered | undefined;
afterEach(() => {
	vi.useRealTimers();
	view?.unmount();
	view = undefined;
	longestBookFinished.current = null;
});

describe("RecordsCard", () => {
	it("opens the longest sitting's details on tap, and only that record is a button", async () => {
		view = await render(<RecordsCard />);
		expect(view.container.querySelectorAll("button")).toHaveLength(1);
		expect(document.body.textContent).not.toContain("Duration (minutes)");
		await click(
			view.container.querySelector("[data-testid=record-longest-sitting]") as HTMLElement,
		);
		expect(document.body.textContent).toContain("Duration (minutes)");
	});

	it("keeps the undo window after deleting the sitting from its sheet", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		view = await render(<RecordsCard />);
		await click(
			view.container.querySelector("[data-testid=record-longest-sitting]") as HTMLElement,
		);
		const del = [...document.body.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Delete",
		) as HTMLElement;
		await click(del);
		await flush();
		expect(toastSuccess).toHaveBeenCalledTimes(1);
		const undo = (toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } }).action;
		await act(async () => undo.onClick());
		await act(async () => {
			vi.advanceTimersByTime(UNDO_WINDOW_MS);
		});
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows the longest finished book's words in the app's one compact count", async () => {
		longestBookFinished.current = { words: 12_500, title: "Middlemarch" };
		view = await render(<RecordsCard />);
		expect(view.container.textContent).toContain("12.5k words");
	});
});
