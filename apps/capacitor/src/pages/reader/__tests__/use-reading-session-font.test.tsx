import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRow } from "../../../services/reading-sessions/rules";
import { resetSummaryStore } from "../../../services/reading-sessions/summary-store";
import { type Rendered, render } from "../../../test/render";
import type { ReadingSessionMode } from "../session-tracker";

const persistRow = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/app", () => ({
	App: { addListener: () => Promise.resolve({ remove: () => Promise.resolve() }) },
}));
vi.mock("../../../services/reading-sessions/persist", () => ({ persistRow }));
vi.mock("../../../services/sync", () => ({ deleteServerSession: vi.fn() }));
vi.mock("../../../services/db/queries", () => ({ queries: {} }));

const { useReadingSession } = await import("../use-reading-session");

let position = 0;
let markActivity: () => void = () => {};

function Reader({ mode }: { mode: ReadingSessionMode }) {
	markActivity = useReadingSession({
		bookId: "b1",
		mode,
		isReading: true,
		rsvpIsPlaying: mode === "rsvp",
		getPosition: () => position,
		fontSize: 16,
	}).markActivity;
	return null;
}

function read(minutes: number) {
	for (let i = 0; i < minutes * 6; i++) {
		position += 40;
		act(() => {
			markActivity();
			vi.advanceTimersByTime(10_000);
		});
	}
}

const lastRowOf = (mode: ReadingSessionMode) =>
	persistRow.mock.calls
		.map(([row]) => row as SessionRow)
		.reverse()
		.find((row) => row.mode === mode);

let view: Rendered | null = null;
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
	resetSummaryStore();
	persistRow.mockClear();
	position = 0;
});
afterEach(() => {
	view?.unmount();
	view = null;
	vi.useRealTimers();
});

describe("useReadingSession font size", () => {
	it("keeps each sitting's own size across a switch between RSVP and scroll", async () => {
		view = await render(<Reader mode="rsvp" />);
		read(3);
		await view.rerender(<Reader mode="scroll" />);
		read(3);
		await view.rerender(<Reader mode="rsvp" />);
		expect(lastRowOf("rsvp")?.fontSize).toBe(32);
		expect(lastRowOf("scroll")?.fontSize).toBe(16);
	});
});
