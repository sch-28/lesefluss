import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { useRsvpEngine } from "../use-rsvp-engine";

const SETTINGS = {
	wpm: 300,
	delayComma: 1,
	delayPeriod: 1,
	accelStart: 1,
	accelRate: 0,
	xOffset: 0,
	focalLetterColor: "#f00",
};
const content = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");

/** A pop-up's clock: queued callbacks run only when the test says so. */
function fakeWindow() {
	const queue = new Map<number, () => void>();
	let nextId = 1;
	const add = (fn: () => void) => {
		const id = nextId++;
		queue.set(id, fn);
		return id;
	};
	const remove = (id: number) => {
		queue.delete(id);
	};
	return {
		win: {
			setTimeout: add,
			clearTimeout: remove,
			requestAnimationFrame: add,
			cancelAnimationFrame: remove,
		} as unknown as Window,
		runAll() {
			const due = [...queue.values()];
			queue.clear();
			for (const fn of due) act(() => fn());
		},
	};
}

type Engine = ReturnType<typeof useRsvpEngine>;
let engine: Engine | null = null;
let view: Rendered | undefined;

afterEach(() => {
	view?.unmount();
	view = undefined;
	engine = null;
});

describe("useRsvpEngine timerWindow", () => {
	it("plays on the given window's clock, not the tab's", async () => {
		const clock = fakeWindow();
		const tabTimeout = vi.spyOn(window, "setTimeout");
		function Probe() {
			engine = useRsvpEngine({
				content,
				initialWord: 0,
				settings: SETTINGS,
				onPositionChange: () => {},
				onFinished: () => {},
				onLookup: () => {},
				onWpmChange: () => {},
				timerWindow: clock.win,
			});
			return null;
		}
		view = await render(<Probe />);
		tabTimeout.mockClear();
		act(() => engine?.play());
		const shown = engine?.wordIndex ?? 0;
		clock.runAll();
		clock.runAll();
		expect(engine?.wordIndex).toBeGreaterThan(shown);
		expect(tabTimeout).not.toHaveBeenCalled();
		tabTimeout.mockRestore();
	});
});
