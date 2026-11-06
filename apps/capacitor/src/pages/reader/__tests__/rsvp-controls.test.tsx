import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import RsvpControls from "../rsvp-controls";
import { TTS_WPM_RANGE } from "../wpm";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const noop = () => {};
const controls = (props: Partial<React.ComponentProps<typeof RsvpControls>>) => (
	<RsvpControls
		wpm={300}
		onBackSentence={noop}
		onBackWord={noop}
		onPlayPause={noop}
		onForwardWord={noop}
		onForwardSentence={noop}
		onWpmChange={noop}
		{...props}
	/>
);

describe("RsvpControls", () => {
	it("has no audio toggle where the device can't read aloud", async () => {
		view = await render(controls({}));
		expect(view.queryButton("Listen")).toBeNull();
	});

	it("shows the audio state and turns it on or off", async () => {
		const onToggle = vi.fn();
		view = await render(controls({ audio: { isOn: true, onToggle } }));
		const toggle = view.getButton("Listen");
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		act(() => toggle.click());
		expect(onToggle).toHaveBeenCalledOnce();
	});

	it("steps the read-aloud speed within its own limits", async () => {
		const onWpmChange = vi.fn();
		view = await render(
			controls({ wpm: TTS_WPM_RANGE.max - 5, wpmRange: TTS_WPM_RANGE, onWpmChange }),
		);
		act(() => view?.getButton("Increase WPM").click());
		expect(onWpmChange).toHaveBeenLastCalledWith(SETTING_CONSTRAINTS.TTS_WPM.max);
		act(() => view?.getButton("Decrease WPM").click());
		expect(onWpmChange).toHaveBeenLastCalledWith(TTS_WPM_RANGE.max - 5 - TTS_WPM_RANGE.step);
	});

	it("steps the RSVP speed by 25 within the RSVP limits by default", async () => {
		const onWpmChange = vi.fn();
		view = await render(controls({ wpm: 300, onWpmChange }));
		act(() => view?.getButton("Increase WPM").click());
		expect(onWpmChange).toHaveBeenLastCalledWith(325);
	});
});
