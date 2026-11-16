import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { swipeSteps, useRsvpSwipe, wpmAfterSteps } from "../rsvp-swipe";
import RsvpView from "../rsvp-view";
import { RSVP_WPM_RANGE } from "../wpm";

const { dragStep } = vi.hoisted(() => ({ dragStep: vi.fn() }));
vi.mock("../../../services/haptics", () => ({ dragStep, tick: vi.fn(), confirmTick: vi.fn() }));
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
const content = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
const noop = () => {};
const onWpmChange = vi.fn();
const onLookup = vi.fn();

function Reader() {
	const [wpm, setWpm] = useState(SETTINGS.wpm);
	return (
		<RsvpView
			content={content}
			initialWord={0}
			settings={{ ...SETTINGS, wpm }}
			fontSize={16}
			onPositionChange={noop}
			onFinished={noop}
			onWpmChange={(next) => {
				onWpmChange(next);
				setWpm(next);
			}}
			onLookup={onLookup}
		/>
	);
}

const display = (view: Rendered) => view.container.querySelector(".rsvp-display") as HTMLElement;
const isPlaying = (view: Rendered) => display(view).getAttribute("aria-label") === "Pause";

function pointer(el: HTMLElement, type: string, clientY: number) {
	act(() => {
		el.dispatchEvent(
			new PointerEvent(type, { bubbles: true, clientY, pointerId: 1, isPrimary: true }),
		);
	});
}

// Past the engine's toggle debounce, so a click that wrongly toggles shows.
const later = () => vi.setSystemTime(Date.now() + 1000);

async function swipe(view: Rendered, ys: number[]) {
	later();
	const el = display(view);
	pointer(el, "pointerdown", ys[0]);
	for (const y of ys.slice(1)) pointer(el, "pointermove", y);
	pointer(el, "pointerup", ys[ys.length - 1]);
	await click(el);
}

let view: Rendered | undefined;
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe("swipeSteps", () => {
	it("counts whole 40px steps, up is faster", () => {
		expect(swipeSteps(-39)).toBe(0);
		expect(swipeSteps(-40)).toBe(1);
		expect(swipeSteps(-95)).toBe(2);
		expect(swipeSteps(85)).toBe(-2);
		expect(swipeSteps(0)).toBe(0);
	});

	it("steps from the base and stops at the dial's limits", () => {
		expect(wpmAfterSteps(300, 2, RSVP_WPM_RANGE)).toBe(350);
		expect(wpmAfterSteps(300, -1, RSVP_WPM_RANGE)).toBe(275);
		expect(wpmAfterSteps(RSVP_WPM_RANGE.max - 25, 3, RSVP_WPM_RANGE)).toBe(RSVP_WPM_RANGE.max);
	});
});

describe("RSVP speed swipe", () => {
	it("raises the speed 25 per step while playing, with a tick each, and keeps playing", async () => {
		view = await render(<Reader />);
		await click(display(view));
		expect(isPlaying(view)).toBe(true);

		await swipe(view, [400, 395, 355, 315]);

		expect(onWpmChange.mock.calls).toEqual([[325], [350]]);
		expect(dragStep).toHaveBeenCalledTimes(2);
		expect(isPlaying(view)).toBe(true);
		expect(view.container.querySelector(".rsvp-speed-chip--flash")?.textContent).toBe("350 wpm");
	});

	it("lowers the speed on a swipe down and steps from where the swipe started", async () => {
		view = await render(<Reader />);
		await click(display(view));
		await swipe(view, [300, 345, 385, 345]);
		expect(onWpmChange.mock.calls).toEqual([[275], [250], [275]]);
		expect(isPlaying(view)).toBe(true);
	});

	it("still pauses on a tap that moves less than the slop", async () => {
		view = await render(<Reader />);
		await click(display(view));
		await swipe(view, [300, 306]);
		expect(onWpmChange).not.toHaveBeenCalled();
		expect(isPlaying(view)).toBe(false);
	});

	it("leaves a paused drag to scrubbing", async () => {
		view = await render(<Reader />);
		expect(isPlaying(view)).toBe(false);
		const el = display(view);
		pointer(el, "pointerdown", 400);
		pointer(el, "pointermove", 300);
		pointer(el, "pointerup", 300);
		expect(onWpmChange).not.toHaveBeenCalled();
		expect(dragStep).not.toHaveBeenCalled();
		expect(onLookup).not.toHaveBeenCalled();
	});
});

describe("useRsvpSwipe", () => {
	// With the voice on the engine isn't playing, so its long-press stays armed; the
	// swipe has to end it or a slow swipe opens the dictionary.
	it("reports the swipe start once, past the slop", async () => {
		const onSwipeStart = vi.fn();
		function Area() {
			const swipe = useRsvpSwipe({
				isEnabled: true,
				wpm: 300,
				range: RSVP_WPM_RANGE,
				onChange: noop,
				onSwipeStart,
			});
			return (
				<div
					data-testid="area"
					onPointerDown={swipe.onPointerDown}
					onPointerMove={swipe.onPointerMove}
					onPointerUp={swipe.onPointerEnd}
				/>
			);
		}
		view = await render(<Area />);
		const el = view.container.querySelector("[data-testid=area]") as HTMLElement;
		pointer(el, "pointerdown", 400);
		pointer(el, "pointermove", 395);
		expect(onSwipeStart).not.toHaveBeenCalled();
		pointer(el, "pointermove", 380);
		pointer(el, "pointermove", 300);
		pointer(el, "pointerup", 300);
		expect(onSwipeStart).toHaveBeenCalledTimes(1);
	});
});
