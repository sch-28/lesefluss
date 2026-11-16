import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import RsvpControls from "../rsvp-controls";

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

	it("names the stepper the voice speed with Listen on and steps it within the given range", async () => {
		const onWpmChange = vi.fn();
		view = await render(
			controls({
				wpm: 240,
				range: { min: 100, max: 250, step: 20 },
				onWpmChange,
				audio: { isOn: true, onToggle: noop },
			}),
		);
		expect(view.container.querySelector('[data-testid="rsvp-wpm-value"]')?.textContent).toBe("240");
		act(() => view?.getButton("Increase voice speed").click());
		expect(onWpmChange).toHaveBeenLastCalledWith(250);
	});

	it("gives every button a 44px target", async () => {
		view = await render(controls({ audio: { isOn: false, onToggle: noop } }));
		for (const name of [
			"Back to sentence start",
			"Back one word",
			"Forward one word",
			"Forward to next sentence",
		]) {
			expect(view.getButton(name).className).toContain("size-11");
		}
		expect(view.getButton("Listen").className).toContain("min-h-11");
	});

	it("steps the RSVP speed by 25 within the RSVP limits by default", async () => {
		const onWpmChange = vi.fn();
		view = await render(controls({ wpm: 300, onWpmChange }));
		act(() => view?.getButton("Increase speed").click());
		expect(onWpmChange).toHaveBeenLastCalledWith(325);
	});
});
