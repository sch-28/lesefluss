import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchCommandKey } from "../../../commands/dispatcher";
import { type ReaderKeyInput, readerKeyCommands } from "../commands";

function setup(overrides: Partial<ReaderKeyInput> = {}) {
	const view = { scrollBy: vi.fn(), goNext: vi.fn(), goPrev: vi.fn() };
	const rsvp = {
		togglePlayPause: vi.fn(),
		forwardWord: vi.fn(),
		backWord: vi.fn(),
		forwardSentence: vi.fn(),
		backSentence: vi.fn(),
		stepWpm: vi.fn(),
	};
	const input: ReaderKeyInput = {
		readerMode: "standard",
		paginationStyle: "scroll",
		isBlocked: false,
		scrollViewRef: { current: view as never },
		rsvpViewRef: { current: rsvp as never },
		handleRsvpToggle: vi.fn(),
		exitRsvpToStandard: vi.fn(),
		hasSelection: false,
		cancelSelection: vi.fn(),
		...overrides,
	};
	const commands = readerKeyCommands(input);
	const press = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
		dispatchCommandKey(
			new KeyboardEvent("keydown", { key, cancelable: true, ...mods }),
			commands.filter((c) => c.when?.() ?? true),
		);
	return { input, view, rsvp, press };
}

afterEach(() => vi.restoreAllMocks());

describe("reader keys", () => {
	it("scrolls a quarter screen in scroll mode", () => {
		const { view, press } = setup();
		for (const key of [" ", "ArrowDown", "PageDown"]) press(key);
		for (const key of ["ArrowUp", "PageUp"]) press(key);
		const steps = view.scrollBy.mock.calls.map(([px]) => Math.sign(px));
		expect(steps).toEqual([1, 1, 1, -1, -1]);
		expect(Math.abs(view.scrollBy.mock.calls[0]?.[0])).toBe(window.innerHeight * 0.25);
		expect(view.goNext).not.toHaveBeenCalled();
	});

	it("turns pages in page mode", () => {
		const { view, press } = setup({ paginationStyle: "page" });
		for (const key of ["ArrowRight", " ", "PageDown"]) press(key);
		for (const key of ["ArrowLeft", "PageUp"]) press(key);
		expect(view.goNext).toHaveBeenCalledTimes(3);
		expect(view.goPrev).toHaveBeenCalledTimes(2);
		expect(view.scrollBy).not.toHaveBeenCalled();
	});

	it("drives the RSVP view, and Escape leaves RSVP", () => {
		const { input, rsvp, press } = setup({ readerMode: "rsvp" });
		press(" ");
		press("ArrowRight");
		press("ArrowLeft");
		press("ArrowRight", { ctrlKey: true });
		press("ArrowUp");
		press("ArrowDown");
		press("Escape");
		expect(rsvp.togglePlayPause).toHaveBeenCalledTimes(1);
		expect(rsvp.forwardWord).toHaveBeenCalledTimes(1);
		expect(rsvp.backWord).toHaveBeenCalledTimes(1);
		expect(rsvp.forwardSentence).toHaveBeenCalledTimes(1);
		expect(rsvp.stepWpm.mock.calls).toEqual([[1], [-1]]);
		expect(input.exitRsvpToStandard).toHaveBeenCalledTimes(1);
	});

	it("clears a selection on Escape before leaving RSVP", () => {
		const { input, press } = setup({ readerMode: "rsvp", hasSelection: true });
		press("Escape");
		expect(input.cancelSelection).toHaveBeenCalledTimes(1);
		expect(input.exitRsvpToStandard).not.toHaveBeenCalled();
	});

	it("does nothing while the reader is blocked", () => {
		for (const readerMode of ["standard", "rsvp"] as const) {
			const { input, view, rsvp, press } = setup({ readerMode, isBlocked: true });
			for (const key of [" ", "ArrowDown", "ArrowRight", "r", "Escape"]) {
				expect(press(key)).toBe(false);
			}
			expect(view.scrollBy).not.toHaveBeenCalled();
			expect(rsvp.togglePlayPause).not.toHaveBeenCalled();
			expect(input.handleRsvpToggle).not.toHaveBeenCalled();
			expect(input.exitRsvpToStandard).not.toHaveBeenCalled();
		}
	});
});
