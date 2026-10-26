import { WordIndex } from "@lesefluss/core";
import { act, useMemo } from "react";
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

type Engine = ReturnType<typeof useRsvpEngine>;
let engine: Engine | null = null;
// A render loop (an effect that keeps setting state) blocks the event loop, so no
// test timeout can stop it: cap the renders instead.
const MAX_RENDERS = 200;
let renders = 0;

/** `refetch` stands for a query refetch: a new value builds a new WordIndex object for the same text. */
function Probe({
	refetch = 0,
	...props
}: {
	content: string;
	initialWord: number;
	refetch?: number;
}) {
	if (++renders > MAX_RENDERS) throw new Error("Probe re-rendered without end");
	// biome-ignore lint/correctness/useExhaustiveDependencies: `refetch` is the trigger for a new object.
	const bookWordIndex = useMemo(() => WordIndex.build(props.content), [props.content, refetch]);
	engine = useRsvpEngine({
		...props,
		settings: SETTINGS,
		onPositionChange: () => {},
		onFinished: () => {},
		onLookup: () => {},
		onWpmChange: () => {},
		bookWordIndex,
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
	renders = 0;
	vi.useRealTimers();
});

const content = "one two three four five six seven eight nine ten";
const shown = () => engine?.currentWord?.word;
/** Plays for about `words` words at 300 wpm. */
const playFor = (words: number) => act(() => vi.advanceTimersByTime(words * 200));

describe("useRsvpEngine when its words are rebuilt", () => {
	it("keeps playing from the word on screen through a refetch of the same text", async () => {
		view = await render(<Probe content={content} initialWord={1} />);
		act(() => engine?.togglePlayPause());
		playFor(2);
		const before = engine?.wordIndex ?? -1;
		expect(before).toBeGreaterThan(1);

		await view.rerender(<Probe content={content} initialWord={1} refetch={1} />);

		expect(engine?.wordIndex).toBe(before);
		expect(engine?.isPlaying).toBe(true);
		playFor(2);
		expect(engine?.wordIndex ?? -1).toBeGreaterThan(before);
	});

	it("keeps a paused word, not the one after it, through a refetch", async () => {
		view = await render(<Probe content={content} initialWord={1} />);
		act(() => engine?.togglePlayPause());
		playFor(2);
		act(() => vi.advanceTimersByTime(200));
		act(() => engine?.togglePlayPause());
		const paused = { index: engine?.wordIndex, word: shown() };

		await view.rerender(<Probe content={content} initialWord={1} refetch={1} />);

		expect({ index: engine?.wordIndex, word: shown() }).toEqual(paused);
		expect(engine?.isPlaying).toBe(false);
	});

	it("stays on the paused word, stopped, if the words ever change", async () => {
		view = await render(<Probe content={content} initialWord={1} />);
		act(() => engine?.togglePlayPause());
		playFor(3);
		act(() => vi.advanceTimersByTime(200));
		act(() => engine?.togglePlayPause());
		// Past the last chunk, the engine's next index is already the word after this one.
		const paused = engine?.wordIndex ?? -1;
		expect(paused).toBeGreaterThan(1);

		await view.rerender(<Probe content={`zero ${content}`} initialWord={1} />);

		expect(engine?.wordIndex).toBe(paused);
		expect(engine?.isPlaying).toBe(false);
		act(() => vi.advanceTimersByTime(2000));
		expect(engine?.wordIndex).toBe(paused);
	});

	it("starts at the entry word once the text first arrives", async () => {
		view = await render(<Probe content="" initialWord={3} />);

		await view.rerender(<Probe content={content} initialWord={3} />);

		expect(shown()).toBe("four");
	});
});
