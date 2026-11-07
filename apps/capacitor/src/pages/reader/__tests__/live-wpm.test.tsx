import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { isLiveWpmShown, LiveWpm } from "../live-wpm";
import { POLL_MS } from "../session-tracker";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
});

describe("isLiveWpmShown", () => {
	it.each([
		["scroll", false, true],
		["page", false, true],
		["rsvp", false, false],
		["page", true, false],
	] as const)("with the setting on, %s mode (listening %s) shows it: %s", (mode, listening, shown) => {
		expect(isLiveWpmShown(true, mode, listening)).toBe(shown);
	});

	it.each(["scroll", "page"] as const)("with the setting off, %s mode shows nothing", (mode) => {
		expect(isLiveWpmShown(false, mode, false)).toBe(false);
	});
});

describe("LiveWpm", () => {
	const on = { showLiveWpm: true };

	it("renders nothing while the rate is null", async () => {
		view = await render(
			<LiveWpm settings={on} mode="scroll" isListening={false} getRate={() => null} />,
		);
		expect(view.text()).toBe("");
	});

	it("shows the rate and follows it as the sitting goes on", async () => {
		vi.useFakeTimers();
		let rate: number | null = null;
		view = await render(
			<LiveWpm settings={on} mode="page" isListening={false} getRate={() => rate} />,
		);
		expect(view.text()).toBe("");

		rate = 248;
		await act(async () => {
			vi.advanceTimersByTime(POLL_MS);
		});
		expect(view.text()).toBe("· 248 wpm");

		rate = 251;
		await act(async () => {
			vi.advanceTimersByTime(POLL_MS);
		});
		expect(view.text()).toBe("· 251 wpm");
	});

	it.each([
		["before the settings load", undefined, "scroll", false],
		["with the setting off", { showLiveWpm: false }, "scroll", false],
		["in RSVP", on, "rsvp", false],
		["while listening", on, "page", true],
	] as const)("shows nothing %s", async (_, settings, mode, isListening) => {
		view = await render(
			<LiveWpm settings={settings} mode={mode} isListening={isListening} getRate={() => 250} />,
		);
		expect(view.text()).toBe("");
	});
});
