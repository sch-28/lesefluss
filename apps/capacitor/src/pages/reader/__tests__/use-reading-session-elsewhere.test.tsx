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

let position = 0;
let markActivity: () => void = () => {};

function Reader({ bookId, isPlayingElsewhere }: { bookId: string; isPlayingElsewhere: boolean }) {
	markActivity = useReadingSession({
		bookId,
		mode: "scroll",
		isReading: true,
		getPosition: () => position,
		isPlayingElsewhere,
	}).markActivity;
	return null;
}

function setHidden(hidden: boolean) {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => (hidden ? "hidden" : "visible"),
	});
	document.dispatchEvent(new Event("visibilitychange"));
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

function lastFlush(): SessionRow | undefined {
	return persistRow.mock.calls.filter(([, kind]) => kind === "flush").at(-1)?.[0];
}

let view: Rendered | null = null;
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
	persistRow.mockClear();
	position = 0;
});
afterEach(() => {
	view?.unmount();
	view = null;
	setHidden(false);
	vi.useRealTimers();
});

describe("useReadingSession while reading goes on in another window", () => {
	it("counts Quick RSVP time while the reader's tab is hidden", async () => {
		view = await render(<Reader bookId="elsewhere" isPlayingElsewhere />);
		act(() => setHidden(true));
		read(90);
		view.unmount();
		view = null;
		expect(lastFlush()?.durationMs).toBeGreaterThanOrEqual(85_000);
	});

	it("keeps counting from Quick RSVP's saves when the hidden tab's timer is throttled", async () => {
		view = await render(<Reader bookId="throttled" isPlayingElsewhere />);
		act(() => setHidden(true));
		for (let i = 0; i < 45; i++) {
			position += 8;
			vi.setSystemTime(Date.now() + 2_000);
			act(() => markActivity());
		}
		view.unmount();
		view = null;
		const row = lastFlush();
		expect(row?.durationMs).toBeGreaterThanOrEqual(85_000);
		expect(row?.wordsRead).toBeGreaterThanOrEqual(300);
	});

	it("counts nothing for a hidden tab without it", async () => {
		view = await render(<Reader bookId="hidden" isPlayingElsewhere={false} />);
		act(() => setHidden(true));
		read(90);
		view.unmount();
		view = null;
		expect(lastFlush()).toBeUndefined();
	});
});
