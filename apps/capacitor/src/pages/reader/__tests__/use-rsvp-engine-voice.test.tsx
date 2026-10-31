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
beforeEach(async () => {
	vi.useFakeTimers();
	view = await render(<Probe />);
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	engine = null;
	onPositionChange.mockReset();
	vi.useRealTimers();
});

const shown = () => engine?.wordIndex;
const voiceAt = (word: number) => act(() => engine?.followVoice(word));
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useRsvpEngine following the read-aloud voice", () => {
	it("holds a word the voice passes quickly, then catches up", async () => {
		voiceAt(1);
		expect(shown()).toBe(1);
		wait(20);
		voiceAt(2);
		expect(shown()).toBe(1);

		wait(99);
		expect(shown()).toBe(1);
		wait(1);
		expect(shown()).toBe(2);
	});

	it("steps through every word the voice ran ahead by, one per dwell", async () => {
		voiceAt(1);
		voiceAt(4);
		const seen = [shown()];
		for (let i = 0; i < 3; i++) {
			wait(120);
			seen.push(shown());
		}

		expect(seen).toEqual([1, 2, 3, 4]);
		wait(500);
		expect(shown()).toBe(4);
	});

	it("shows a word at once when the last one has been up long enough", async () => {
		voiceAt(1);
		wait(300);
		voiceAt(2);

		expect(shown()).toBe(2);
	});

	it("jumps to the voice when it is more than three words ahead", async () => {
		voiceAt(1);
		voiceAt(5);

		expect(shown()).toBe(5);
	});

	it("stops at the last word when the voice reports past it", async () => {
		act(() => engine?.jumpToWord(38));
		voiceAt(41);
		wait(1000);

		expect(shown()).toBe(39);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("follows the voice back at once", async () => {
		voiceAt(5);
		voiceAt(2);

		expect(shown()).toBe(2);
	});

	it("drops the catch-up when the word is set directly", async () => {
		voiceAt(1);
		voiceAt(4);
		act(() => engine?.showWord(2));
		wait(500);
		expect(shown()).toBe(2);

		voiceAt(3);
		voiceAt(5);
		act(() => engine?.jumpToWord(4));
		wait(500);
		expect(shown()).toBe(4);
	});

	it("plays and pauses normally when play starts mid catch-up", async () => {
		voiceAt(1);
		voiceAt(4);
		act(() => engine?.togglePlayPause());
		wait(150);
		expect(engine?.isPlaying).toBe(true);

		act(() => engine?.togglePlayPause());
		const paused = shown();
		wait(1000);

		expect(engine?.isPlaying).toBe(false);
		expect(shown()).toBe(paused);
	});

	it("saves the voice's word, not the lagging one, when paused mid catch-up", async () => {
		voiceAt(1);
		voiceAt(4);
		act(() => engine?.pause());

		expect(shown()).toBe(4);
		expect(onPositionChange.mock.lastCall).toEqual([4]);
	});

	it("saves the voice's word when unmounted mid catch-up", async () => {
		voiceAt(1);
		voiceAt(4);
		view?.unmount();
		view = undefined;

		expect(onPositionChange.mock.lastCall).toEqual([4]);
	});
});
