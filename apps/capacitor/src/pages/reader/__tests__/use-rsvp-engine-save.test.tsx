import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
// 300 wpm: a word every 200ms. The throttled save fires on the tick at 2000ms,
// which shows word 10.
const SAVE_TICK_MS = 2000;
const SAVED_WORD = 10;

type Engine = ReturnType<typeof useRsvpEngine>;
let engine: Engine | null = null;
const onPositionChange = vi.fn<(word: number) => void>();

function Probe() {
	engine = useRsvpEngine({
		content,
		initialWord: 0,
		settings: SETTINGS,
		onPositionChange,
		onFinished: () => {},
		onLookup: () => {},
		onWpmChange: () => {},
	});
	return null;
}

let view: Rendered | undefined;
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	engine = null;
	onPositionChange.mockReset();
	vi.useRealTimers();
});

/** Plays up to and including the tick that starts the throttled save. */
async function playToSaveTick() {
	view = await render(<Probe />);
	act(() => engine?.togglePlayPause());
	act(() => vi.advanceTimersByTime(SAVE_TICK_MS));
	expect(engine?.wordIndex).toBe(SAVED_WORD);
}

const lastSaved = () => onPositionChange.mock.lastCall?.[0];

describe("useRsvpEngine throttled position save", () => {
	it("reports the word after it has painted, not in the tick that shows it", async () => {
		await playToSaveTick();
		expect(onPositionChange).not.toHaveBeenCalled();

		act(() => vi.advanceTimersByTime(50));

		expect(onPositionChange).toHaveBeenCalledTimes(1);
		expect(lastSaved()).toBe(SAVED_WORD);
	});

	it("drops the pending save on pause, leaving the pause's save alone", async () => {
		await playToSaveTick();
		act(() => engine?.togglePlayPause());

		act(() => vi.advanceTimersByTime(1000));

		expect(onPositionChange.mock.calls).toEqual([[SAVED_WORD]]);
	});

	it("drops the pending save on a jump", async () => {
		await playToSaveTick();
		act(() => engine?.jumpToWord(30));

		act(() => vi.advanceTimersByTime(1000));

		expect(onPositionChange.mock.calls).toEqual([[30]]);
	});

	it("drops the pending save when a word is shown directly", async () => {
		await playToSaveTick();
		act(() => engine?.showWord(30));

		act(() => vi.advanceTimersByTime(1000));

		expect(onPositionChange).not.toHaveBeenCalled();
	});

	it("drops the pending save on pagehide, keeping the flushed word", async () => {
		await playToSaveTick();
		window.dispatchEvent(new Event("pagehide"));

		act(() => vi.advanceTimersByTime(1000));

		expect(onPositionChange.mock.calls).toEqual([[SAVED_WORD]]);
	});

	it("drops the pending save on unmount, keeping the flushed word", async () => {
		await playToSaveTick();
		view?.unmount();
		view = undefined;

		act(() => vi.advanceTimersByTime(1000));

		expect(onPositionChange.mock.calls).toEqual([[SAVED_WORD]]);
	});
});
