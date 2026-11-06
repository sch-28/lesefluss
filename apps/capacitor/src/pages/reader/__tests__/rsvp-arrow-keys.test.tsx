import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { act, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandDispatcher } from "../../../commands/dispatcher";
import { type Rendered, render } from "../../../test/render";
import RsvpView, { type RsvpAudio, type RsvpViewHandle } from "../rsvp-view";
import { useKeyboardShortcuts } from "../use-keyboard-shortcuts";
import type { ReaderViewHandle } from "../view-types";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ history: { push: vi.fn() }, navigate: vi.fn() }),
}));
vi.mock("../../../contexts/theme-context", () => ({
	useTheme: () => ({ theme: "light" }),
	focalLetterColorFor: (color: string) => color,
}));
vi.mock("../../settings/rsvp-settings-form", () => ({ default: () => null }));

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
const noop = () => {};

let speeds = { wpm: 0, ttsWpm: 0 };

function Reader({ isAudioOn, ttsWpm }: { isAudioOn: boolean; ttsWpm: number }) {
	const [wpm, setWpm] = useState(SETTINGS.wpm);
	const [tts, setTts] = useState(ttsWpm);
	speeds = { wpm, ttsWpm: tts };
	const rsvpViewRef = useRef<RsvpViewHandle>(null);
	const scrollViewRef = useRef<ReaderViewHandle>(null);
	const audio: RsvpAudio = {
		isOn: isAudioOn,
		isPlaying: false,
		onToggleAudio: noop,
		onTogglePlay: noop,
		wpm: tts,
		onWpmChange: setTts,
		isSleepTimerOn: false,
		onOpenVoice: noop,
		onOpenSleepTimer: noop,
	};
	useCommandDispatcher();
	useKeyboardShortcuts({
		readerMode: "rsvp",
		paginationStyle: "scroll",
		isBlocked: false,
		scrollViewRef,
		rsvpViewRef,
		handleRsvpToggle: noop,
		exitRsvpToStandard: noop,
		hasSelection: false,
		cancelSelection: noop,
		volumeKeys: { enabled: false, invert: false },
		isReadingAloud: isAudioOn,
	});
	return (
		<RsvpView
			ref={rsvpViewRef}
			content={content}
			initialWord={0}
			settings={{ ...SETTINGS, wpm }}
			fontSize={16}
			onPositionChange={noop}
			onFinished={noop}
			onWpmChange={setWpm}
			onLookup={noop}
			audio={audio}
		/>
	);
}

const press = (key: string) =>
	act(() => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
	});
const stepperValue = (view: Rendered) =>
	Number(view.container.querySelector(".rsvp-wpm-value")?.textContent);

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("ArrowUp/ArrowDown in RSVP", () => {
	it("steps the read-aloud speed within its limits while audio is on", async () => {
		const { max, step } = SETTING_CONSTRAINTS.TTS_WPM;
		view = await render(<Reader isAudioOn ttsWpm={max - step - 5} />);

		press("ArrowUp");
		expect(speeds).toEqual({ wpm: SETTINGS.wpm, ttsWpm: max - 5 });
		expect(stepperValue(view)).toBe(max - 5);

		press("ArrowUp");
		expect(speeds.ttsWpm).toBe(max);
		expect(stepperValue(view)).toBe(max);

		press("ArrowDown");
		expect(speeds).toEqual({ wpm: SETTINGS.wpm, ttsWpm: max - step });
		expect(stepperValue(view)).toBe(max - step);
	});

	it("steps the RSVP wpm while audio is off", async () => {
		view = await render(<Reader isAudioOn={false} ttsWpm={180} />);

		press("ArrowUp");
		expect(speeds).toEqual({ wpm: 325, ttsWpm: 180 });
		expect(stepperValue(view)).toBe(325);

		press("ArrowDown");
		press("ArrowDown");
		expect(speeds).toEqual({ wpm: 275, ttsWpm: 180 });
		expect(stepperValue(view)).toBe(275);
	});
});
