import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CLOSE_SETTLE_MS,
	resetSummaryStore,
	useSessionSummary,
} from "../../../services/reading-sessions/summary-store";
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
let summary: ReturnType<typeof useSessionSummary> = null;

function Reader({ bookId }: { bookId: string }) {
	markActivity = useReadingSession({
		bookId,
		mode: "scroll",
		isReading: true,
		getPosition: () => position,
	}).markActivity;
	return null;
}

function Summary() {
	summary = useSessionSummary();
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

async function settle() {
	await act(async () => {
		vi.advanceTimersByTime(CLOSE_SETTLE_MS);
	});
}

let views: Rendered[] = [];
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
	resetSummaryStore();
	position = 0;
	summary = null;
});
afterEach(() => {
	for (const v of views) v.unmount();
	views = [];
	vi.useRealTimers();
});

describe("useReadingSession and the session summary", () => {
	it("publishes the sitting when the reader closes after 2 minutes", async () => {
		views.push(await render(<Summary />));
		const reader = await render(<Reader bookId="b1" />);
		read(3);
		reader.unmount();
		await settle();
		expect(summary?.bookId).toBe("b1");
		expect(summary?.sittings).toHaveLength(1);
		expect(persistRow).toHaveBeenCalled();
	});

	it("publishes nothing when the reader closes sooner", async () => {
		views.push(await render(<Summary />));
		const reader = await render(<Reader bookId="b1" />);
		read(0.5);
		reader.unmount();
		await settle();
		expect(summary).toBeNull();
	});

	it("waits out the router's re-mount on the way out", async () => {
		views.push(await render(<Summary />));
		const reader = await render(<Reader bookId="b1" />);
		read(3);
		reader.unmount();
		const remount = await render(<Reader bookId="b1" />);
		expect(summary).toBeNull();
		remount.unmount();
		await settle();
		expect(summary?.sittings).toHaveLength(1);
	});
});
