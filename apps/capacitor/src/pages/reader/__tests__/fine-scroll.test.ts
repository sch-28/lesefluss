import type { VListHandle } from "virtua";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleFineScroll } from "../scroll-view";

const SLOW_FRAME_MS = 1000;
const list = { scrollBy: vi.fn() };
let spanTop = 0;
let container: HTMLElement;

function schedule(onReady: () => void) {
	return scheduleFineScroll(
		list as unknown as VListHandle,
		container,
		5,
		0,
		10,
		{ suppressScrollEnd: { current: false }, suppressHighlight: { current: false } },
		false,
		onReady,
	);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	list.scrollBy.mockClear();
	Object.defineProperty(document, "fonts", { value: undefined, configurable: true });
	container = document.createElement("div");
	container.innerHTML = '<span data-word="5">word</span>';
	container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
	const span = container.querySelector("span") as HTMLElement;
	span.getBoundingClientRect = () => ({ top: spanTop }) as DOMRect;
	spanTop = 300;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("scheduleFineScroll", () => {
	it("at a frame a second, aligns only once the layout has been still for frames, not after a fixed time", () => {
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
			setTimeout(() => cb(performance.now()), SLOW_FRAME_MS),
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
		const onReady = vi.fn();
		schedule(onReady);

		// VList re-measures for five frames, moving the word each time.
		for (let frame = 0; frame < 5; frame++) {
			vi.advanceTimersByTime(SLOW_FRAME_MS);
			spanTop -= 30;
		}
		expect(list.scrollBy).not.toHaveBeenCalled();
		expect(onReady).not.toHaveBeenCalled();

		vi.advanceTimersByTime(SLOW_FRAME_MS * 4);
		expect(list.scrollBy).toHaveBeenCalledOnce();
		expect(list.scrollBy).toHaveBeenCalledWith(149);
		expect(onReady).toHaveBeenCalledOnce();
	});

	it("still aligns when frames stop once the word has mounted (a tab hidden mid-open)", () => {
		let frames = 0;
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
			frames++ === 0 ? setTimeout(() => cb(performance.now()), SLOW_FRAME_MS) : 0,
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
		const onReady = vi.fn();
		schedule(onReady);

		vi.advanceTimersByTime(SLOW_FRAME_MS + 3999);
		expect(list.scrollBy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(list.scrollBy).toHaveBeenCalledWith(299);
		expect(onReady).toHaveBeenCalledOnce();
	});
});
