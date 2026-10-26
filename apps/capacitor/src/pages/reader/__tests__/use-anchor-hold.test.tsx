import { act, useRef } from "react";
import type { VListHandle } from "virtua";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { useAnchorHold } from "../use-anchor-hold";

const observed = new Map<Element, ResizeObserverCallback>();
class FakeResizeObserver {
	constructor(private callback: ResizeObserverCallback) {}
	observe(target: Element) {
		observed.set(target, this.callback);
	}
	disconnect() {}
	unobserve() {}
}

function resize(target: Element, width: number) {
	act(() => {
		observed.get(target)?.(
			[{ contentRect: { width } } as ResizeObserverEntry],
			{} as ResizeObserver,
		);
	});
}

type Api = ReturnType<typeof useAnchorHold>;

const VIEWPORT_HEIGHT = 800;
/** VList's scrollBy moves the list, and with it the text, unless the end of the book stops it. */
let listMoves = true;
let scrollTop = 10_000;
const list = {
	scrollToIndex: vi.fn(),
	scrollBy: vi.fn((delta: number) => {
		if (!listMoves) return;
		scrollTop += delta;
		wordOffset -= delta;
	}),
};
const cancelViewScrolls = vi.fn();
const onReaderInput = vi.fn();
let api: Api;
let settled = true;
let wordMounted = true;
let headed = false;
let anchorWord: number | null = 7;
/** The anchor is a heading paragraph, which renders without word spans. */
let headingAnchor = false;
/** The anchor's line, in px below the top edge. */
let wordOffset = 0;
let view: Rendered | undefined;

/** Container > VList viewport > inner > item > text, as VList renders it. */
function Harness({ layoutKey }: { layoutKey: string }) {
	const listRef = useRef(list as unknown as VListHandle);
	const containerRef = useRef<HTMLDivElement>(null);
	api = useAnchorHold({
		listRef,
		containerRef,
		layoutKey,
		getAnchorWord: () => anchorWord,
		findParagraphIndexForWord: () => 2,
		findWordSpan: () => {
			const selector = headingAnchor ? "[data-heading-word]" : "span[data-word]";
			const el = containerRef.current?.querySelector<HTMLElement>(selector);
			if (!wordMounted || !el) return null;
			el.getBoundingClientRect = () => ({ top: wordOffset }) as DOMRect;
			return el;
		},
		isHeadedParagraphStart: () => headed,
		isInitialScrollSettled: () => settled,
		cancelViewScrolls,
		onReaderInput,
	});
	return (
		<div ref={containerRef}>
			<div>
				<div>
					<div>
						<h2 data-heading-word="5">Chapter</h2>
						<p>
							<span data-word="7">word</span>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

const container = () => view?.container.firstElementChild as HTMLElement;
const viewport = () => container().firstElementChild as HTMLElement;
const word = () => view?.container.querySelector("span") as HTMLElement;
const changeLayout = () => view?.rerender(<Harness layoutKey="b" />);
const resizeTo = (width: number) => resize(container(), width);
const FRAME_MS = 16;
/** QUIET_MS plus the still frames quiet also waits for. */
const quiet = () => act(() => vi.advanceTimersByTime(400));
/** An open or a jump has landed with the word on the edge, and the list went quiet. */
const holdLanded = () => {
	act(() => api.holdAnchor(7));
	quiet();
};

/** VList compensating a paragraph measured above: the offset moves, the text stays. */
function compensate(delta: number) {
	scrollTop += delta;
	api.noteScroll();
}

/** The text moves with no scroll: a paragraph above it in view changed height. */
function layoutShift(offset: number) {
	wordOffset = offset;
	api.noteScroll();
}

/** Someone scrolls (a screen reader, find-in-page): offset and text move together. */
function othersScroll(delta: number) {
	scrollTop += delta;
	wordOffset -= delta;
	api.noteScroll();
}

function pointer(type: string, target: EventTarget, init: Record<string, unknown> = {}) {
	const event = new Event(type, { bubbles: true });
	for (const [key, value] of Object.entries({ pointerType: "mouse", button: 0, ...init })) {
		Object.defineProperty(event, key, { value });
	}
	target.dispatchEvent(event);
}

function touch(type: "touchstart" | "touchmove", clientY: number) {
	const event = new Event(type, { bubbles: true });
	Object.defineProperty(event, "touches", { value: [{ clientY }] });
	viewport().dispatchEvent(event);
}

const pressKey = (key: string) =>
	document.body.dispatchEvent(
		new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
	);

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
	vi.stubGlobal("ResizeObserver", FakeResizeObserver);
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
		setTimeout(() => cb(performance.now()), FRAME_MS),
	);
	vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
	observed.clear();
	list.scrollToIndex.mockClear();
	list.scrollBy.mockClear();
	cancelViewScrolls.mockClear();
	onReaderInput.mockClear();
	listMoves = true;
	scrollTop = 10_000;
	settled = true;
	wordMounted = true;
	headed = false;
	anchorWord = 7;
	headingAnchor = false;
	wordOffset = 0;
	view = await render(<Harness layoutKey="a" />);
	Object.defineProperty(container(), "clientHeight", { value: VIEWPORT_HEIGHT });
	Object.defineProperty(viewport(), "scrollTop", { get: () => scrollTop });
	Object.defineProperty(viewport(), "clientWidth", { value: 600 });
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	window.dispatchEvent(new Event("pointerup"));
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("useAnchorHold: a reflow", () => {
	it("scrolls to the word's offset in its paragraph and settles once the list is quiet", async () => {
		await changeLayout();
		expect(cancelViewScrolls).toHaveBeenCalledOnce();
		expect(api.isSettling()).toBe(true);
		expect(list.scrollToIndex).toHaveBeenCalledWith(2, { align: "start", offset: -1 });

		act(() => vi.advanceTimersByTime(250));
		api.noteScroll();
		act(() => vi.advanceTimersByTime(250));
		expect(api.isSettling()).toBe(true);
		act(() => vi.advanceTimersByTime(100));
		expect(api.isSettling()).toBe(false);
		expect(api.isPending()).toBe(true);
	});

	it("is not quiet until frames have passed with the word still, however long it was", async () => {
		await changeLayout();
		wordOffset = 30;
		act(() => vi.advanceTimersByTime(300));
		expect(list.scrollBy).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(FRAME_MS * 2));
		wordOffset = 20;
		act(() => vi.advanceTimersByTime(FRAME_MS * 3));
		expect(list.scrollBy).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(FRAME_MS));
		expect(list.scrollBy).toHaveBeenCalledWith(19);
	});

	it("targets the paragraph start until the word is mounted", async () => {
		wordMounted = false;
		await changeLayout();
		expect(list.scrollToIndex).toHaveBeenLastCalledWith(2, { align: "start" });
		quiet();
		expect(list.scrollToIndex).toHaveBeenCalledTimes(2);

		wordMounted = true;
		wordOffset = 30;
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(29);
	});

	it("aims a heading anchor at its heading, which has no word spans", async () => {
		headingAnchor = true;
		await changeLayout();
		expect(list.scrollToIndex).toHaveBeenCalledWith(2, { align: "start", offset: -1 });

		wordOffset = 30;
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(29);
		wordOffset = 1;
		quiet();
		expect(api.isSettling()).toBe(false);
		expect(api.isPending()).toBe(true);
	});

	it("keeps an inline chapter title in view at a chapter start", async () => {
		headed = true;
		await changeLayout();
		expect(list.scrollToIndex).toHaveBeenCalledWith(2, { align: "start" });
		quiet();
		expect(api.isSettling()).toBe(false);
	});

	it("lets go of a word that cannot reach the edge (the end of the book)", async () => {
		listMoves = false;
		wordOffset = 30;
		await changeLayout();
		for (let i = 0; i < 13; i++) quiet();
		expect(list.scrollBy).toHaveBeenCalledTimes(11);
		expect(api.isPending()).toBe(false);
	});

	it("ends an old hold when a new reflow has no word to anchor", async () => {
		await changeLayout();
		quiet();
		expect(api.isPending()).toBe(true);

		anchorWord = null;
		await view?.rerender(<Harness layoutKey="c" />);
		expect(api.isPending()).toBe(false);
		layoutShift(30);
		quiet();
		expect(list.scrollBy).not.toHaveBeenCalled();
	});

	it("waits for the initial scroll to land before re-anchoring", async () => {
		settled = false;
		await changeLayout();
		expect(list.scrollToIndex).not.toHaveBeenCalled();

		settled = true;
		act(() => api.onInitialScrollSettled());
		expect(list.scrollToIndex).toHaveBeenCalledOnce();
		expect(api.isPending()).toBe(true);
	});

	it("does not re-anchor after an initial landing without a layout change", () => {
		act(() => api.onInitialScrollSettled());
		expect(list.scrollToIndex).not.toHaveBeenCalled();
	});

	it("follows a width change but not a container hidden to zero width and back", () => {
		resizeTo(400);
		resizeTo(0);
		resizeTo(400);
		expect(list.scrollToIndex).not.toHaveBeenCalled();

		resizeTo(320);
		expect(list.scrollToIndex).toHaveBeenCalledOnce();
	});
});

describe("useAnchorHold: holding a landed word", () => {
	it("holds the given word without aiming, whatever the reader's anchor is, and corrects a layout shift", () => {
		anchorWord = null;
		holdLanded();
		expect(api.isPending()).toBe(true);
		expect(api.isSettling()).toBe(false);
		expect(list.scrollToIndex).not.toHaveBeenCalled();
		expect(list.scrollBy).not.toHaveBeenCalled();

		layoutShift(24);
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(23);
		expect(api.isPending()).toBe(true);
	});

	it("ignores VList's compensation, even when nothing seems to change in size", () => {
		holdLanded();
		compensate(37);
		compensate(-12);
		expect(api.isPending()).toBe(true);
		quiet();
		expect(list.scrollBy).not.toHaveBeenCalled();
	});

	it("hands back someone else's scroll, with no callback for the reader's input", () => {
		holdLanded();
		othersScroll(300);
		expect(api.isPending()).toBe(false);
		expect(onReaderInput).not.toHaveBeenCalled();
		quiet();
		expect(list.scrollBy).not.toHaveBeenCalled();
	});

	it("hands back someone else's scroll that comes with a resize further down", () => {
		holdLanded();
		api.noteResize();
		othersScroll(120);
		expect(api.isPending()).toBe(false);
	});

	it("lets the landing align's own scroll through, however far it goes (a smooth jump)", () => {
		wordOffset = 900;
		act(() => api.holdAnchor(7));
		othersScroll(500);
		othersScroll(399);
		expect(api.isPending()).toBe(true);
		quiet();
		expect(api.isPending()).toBe(true);
	});

	it("brings a word its align has not landed yet onto the edge", () => {
		wordOffset = 174;
		act(() => api.holdAnchor(7));
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(173);
	});

	it("takes its own correction's scroll for its own, not someone else's", () => {
		holdLanded();
		layoutShift(30);
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(29);
		api.noteScroll();
		expect(api.isPending()).toBe(true);
	});

	it("corrects every late shift, within one budget per hold", () => {
		holdLanded();
		for (let i = 0; i < 15; i++) {
			layoutShift(30);
			quiet();
			api.noteScroll();
			quiet();
		}
		expect(list.scrollBy).toHaveBeenCalledTimes(12);
		expect(api.isPending()).toBe(false);
	});

	it("lets go of a layout that never goes quiet", () => {
		holdLanded();
		for (let i = 0; i < 60; i++) {
			act(() => vi.advanceTimersByTime(200));
			api.noteResize();
		}
		expect(api.isPending()).toBe(false);
	});

	it("counts a line a sub-pixel above the edge as on it", () => {
		holdLanded();
		layoutShift(-1.5);
		quiet();
		expect(list.scrollBy).not.toHaveBeenCalled();
	});

	it("corrects the text moving without a scroll event (a paragraph in view growing)", () => {
		holdLanded();
		wordOffset = 39;
		resize(viewport().firstElementChild as Element, 600);
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(38);
	});

	it("ignores small compensations a whole-pixel scroll offset rounds to (DPR 1)", () => {
		holdLanded();
		compensate(1);
		compensate(1.4);
		scrollTop += 2;
		wordOffset -= 0.6;
		api.noteScroll();
		compensate(37);
		expect(api.isPending()).toBe(true);
	});

	it("hands back someone else's scroll far past a viewport", () => {
		holdLanded();
		othersScroll(VIEWPORT_HEIGHT + 50);
		expect(api.isPending()).toBe(false);
	});

	it("corrects a far move no scroll explains (a tall figure loading above the word)", () => {
		holdLanded();
		layoutShift(VIEWPORT_HEIGHT + 50);
		expect(api.isPending()).toBe(true);
		quiet();
		expect(list.scrollBy).toHaveBeenCalledWith(VIEWPORT_HEIGHT + 49);
	});

	it("stops correcting a word that cannot get closer, and still hands back someone else's scroll", () => {
		listMoves = false;
		wordOffset = 174;
		act(() => api.holdAnchor(7));
		quiet();
		expect(list.scrollBy).toHaveBeenCalledTimes(1);
		quiet();
		quiet();
		expect(list.scrollBy).toHaveBeenCalledTimes(1);
		expect(api.isPending()).toBe(true);

		othersScroll(300);
		expect(api.isPending()).toBe(false);
	});

	it("takes the compensation trailing its own correction, while the paragraph grows, for a shift", () => {
		holdLanded();
		layoutShift(30);
		quiet();
		api.noteScroll();
		api.noteResize();
		othersScroll(10);
		expect(api.isPending()).toBe(true);
	});

	it("never aims at a held word that is no longer mounted: it hands back", () => {
		holdLanded();
		wordMounted = false;
		api.noteScroll();
		quiet();
		expect(api.isPending()).toBe(false);
		expect(list.scrollBy).not.toHaveBeenCalled();
		expect(list.scrollToIndex).not.toHaveBeenCalled();
	});

	it("does not take over a reflow already running", async () => {
		await changeLayout();
		act(() => api.holdAnchor(7));
		expect(api.isSettling()).toBe(true);
	});

	it("does nothing once unmounted", () => {
		holdLanded();
		layoutShift(30);
		view?.unmount();
		view = undefined;
		act(() => vi.advanceTimersByTime(2000));
		expect(list.scrollBy).not.toHaveBeenCalled();
	});
});

describe("useAnchorHold: the reader's own input", () => {
	beforeEach(holdLanded);

	it("hands the view back to a wheel, and says so (a jump's release does not)", () => {
		api.release("programmatic");
		expect(onReaderInput).not.toHaveBeenCalled();
		holdLanded();
		viewport().dispatchEvent(new Event("wheel", { bubbles: true }));
		expect(api.isPending()).toBe(false);
		expect(onReaderInput).toHaveBeenCalledOnce();
	});

	it("hands the view back to a touch drag, but not to a finger resting on a word", () => {
		touch("touchstart", 100);
		touch("touchmove", 106);
		expect(api.isPending()).toBe(true);
		touch("touchmove", 115);
		expect(api.isPending()).toBe(false);
	});

	it("is not ended by a pan before it began (a pan in a popover ends in pointercancel)", () => {
		api.release("programmatic");
		pointer("pointerdown", word(), { pointerType: "touch" });
		pointer("pointercancel", window, { pointerType: "touch" });
		holdLanded();
		compensate(40);
		expect(api.isPending()).toBe(true);
	});

	it("hands back focus moving into the text, with no callback for the reader's input", () => {
		word().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(api.isPending()).toBe(false);
		expect(onReaderInput).not.toHaveBeenCalled();
	});

	it("hands the view back to a scroll while the scrollbar is pressed, not after a click", () => {
		pointer("pointerdown", viewport(), { offsetX: 605 });
		pointer("pointerup", window);
		compensate(10);
		expect(api.isPending()).toBe(true);

		pointer("pointerdown", viewport(), { offsetX: 605 });
		compensate(20);
		expect(api.isPending()).toBe(false);
	});

	it("does not take a press on the side margin for the scrollbar", () => {
		pointer("pointerdown", viewport(), { offsetX: 10 });
		compensate(10);
		expect(api.isPending()).toBe(true);
	});

	it("keeps a press through a focus move inside the page", () => {
		pointer("pointerdown", viewport(), { offsetX: 605 });
		word().dispatchEvent(new FocusEvent("blur"));
		compensate(10);
		expect(api.isPending()).toBe(false);
	});

	it("forgets a press from before the hold began", () => {
		api.release("programmatic");
		pointer("pointerdown", viewport(), { offsetX: 605 });
		holdLanded();
		compensate(10);
		expect(api.isPending()).toBe(true);
	});

	it("hands the view back to a selection dragged past the edge, not to a press on the text", () => {
		pointer("pointerdown", word(), { clientX: 10, clientY: 10 });
		compensate(10);
		expect(api.isPending()).toBe(true);

		pointer("pointermove", window, { clientX: 10, clientY: 30 });
		compensate(20);
		expect(api.isPending()).toBe(false);
	});

	it("hands the view back to middle-click autoscroll, also after the button is up", () => {
		pointer("pointerdown", word(), { button: 1 });
		pointer("pointerup", window);
		compensate(10);
		expect(api.isPending()).toBe(false);
	});

	it("ends autoscroll at the next click anywhere", () => {
		pointer("pointerdown", word(), { button: 1 });
		pointer("pointerup", window);
		pointer("pointerdown", document.body);
		pointer("pointerup", window);
		compensate(10);
		expect(api.isPending()).toBe(true);
	});

	it("lets go of a press even when its pointerup does not bubble", () => {
		const stop = (e: Event) => e.stopPropagation();
		word().addEventListener("pointerup", stop);
		pointer("pointerdown", viewport(), { offsetX: 605 });
		pointer("pointerup", word());
		word().removeEventListener("pointerup", stop);
		compensate(10);
		expect(api.isPending()).toBe(true);
	});

	it("hands the view back to the scroll a native scroll key makes, however late it comes", () => {
		pressKey("PageDown");
		act(() => vi.advanceTimersByTime(1500));
		compensate(10);
		expect(api.isPending()).toBe(false);
	});

	it("does not count keys the reader's shortcuts consumed, whenever they listen, or typed into a field", () => {
		const consume = (e: Event) => e.preventDefault();
		window.addEventListener("keydown", consume);
		pressKey("ArrowDown");
		act(() => vi.advanceTimersByTime(1));
		window.removeEventListener("keydown", consume);
		const field = document.createElement("input");
		document.body.append(field);
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		field.remove();
		compensate(10);
		expect(api.isPending()).toBe(true);
	});
});
