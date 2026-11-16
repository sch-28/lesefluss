import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRow } from "../../../services/reading-sessions/rules";
import { type Rendered, render } from "../../../test/render";

const persistRow = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/app", () => ({
	App: { addListener: () => Promise.resolve({ remove: () => Promise.resolve() }) },
}));
vi.mock("../../../services/reading-sessions/persist", () => ({ persistRow }));
vi.mock("../../../services/sync", () => ({ deleteServerSession: vi.fn() }));
vi.mock("../../../services/db/queries", () => ({ queries: {} }));

const { useReadingSession } = await import("../use-reading-session");
const { sittingCarries } = await import("../../../services/reading-sessions/carry");

let position = 0;
let markActivity: () => void = () => {};

function Reader({ mode }: { mode: "scroll" | "rsvp" }) {
	markActivity = useReadingSession({
		bookId: "carried",
		mode,
		isReading: true,
		getPosition: () => position,
	}).markActivity;
	return null;
}

function read(seconds: number) {
	for (let i = 0; i < seconds / 5; i++) {
		position += 20;
		act(() => {
			markActivity();
			vi.advanceTimersByTime(5_000);
		});
	}
}

function flushes(): SessionRow[] {
	return persistRow.mock.calls.filter(([, kind]) => kind === "flush").map(([row]) => row);
}

let view: Rendered | null = null;
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
	persistRow.mockClear();
	sittingCarries.clear();
	position = 0;
});
afterEach(() => {
	view?.unmount();
	view = null;
	vi.useRealTimers();
});

describe("useReadingSession short bursts", () => {
	it("joins two short visits to one book in different modes into one saved sitting", async () => {
		view = await render(<Reader mode="scroll" />);
		read(35);
		view.unmount();
		expect(flushes()).toHaveLength(0);

		vi.advanceTimersByTime(20_000);
		view = await render(<Reader mode="rsvp" />);
		read(30);
		view.unmount();
		view = null;

		const rows = flushes();
		expect(rows).toHaveLength(1);
		expect(rows[0].mode).toBe("scroll");
		expect(rows[0].durationMs).toBeGreaterThanOrEqual(60_000);
	});
});
