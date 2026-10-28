import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS } from "../long-press";
import {
	cancelAnyActiveLongPress,
	hasLongPressFiredFor,
	registerWordGestureRoot,
	type WordGestureHandlers,
} from "../word-gestures";

const unregisters: (() => void)[] = [];

// happy-dom has no hit testing; tests that need it say what lies under a point.
let underPoint: (x: number, y: number) => Element[] = () => [];
document.elementsFromPoint = (x: number, y: number) => underPoint(x, y);

function handlers() {
	return {
		onWordTap: vi.fn(),
		onWordLongPress: vi.fn(),
		onWordLongPressDrag: vi.fn(),
		onWordMouseDragStart: vi.fn(),
	} satisfies WordGestureHandlers;
}

function setUp() {
	document.body.innerHTML = `
		<div id="root"><p id="para">
			<span data-word="10">Alpha</span>
			<span data-word="11"><span class="glossary-inline-avatar">B</span>Beta</span>
		</p></div>
		<div id="other"><p><span data-word="50">Gamma</span></p></div>
		<div id="elsewhere"><span data-word="99">Outside</span></div>`;
	const h = handlers();
	unregisters.push(registerWordGestureRoot(byId("root"), () => h));
	return h;
}

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const word = (n: number) => document.querySelector(`[data-word="${n}"]`) as HTMLElement;

function pointer(
	target: Element,
	type: string,
	{ pointerId = 1, pointerType = "touch", x = 0, y = 0 } = {},
) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			pointerId,
			pointerType,
			clientX: x,
			clientY: y,
		}),
	);
}

const click = (target: Element) =>
	target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

/** A press and release in place, then the click it produces. */
function tap(target: Element, pointerType = "touch") {
	pointer(target, "pointerdown", { pointerType });
	pointer(target, "pointerup", { pointerType });
	click(target);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	for (const unregister of unregisters.splice(0)) unregister();
	underPoint = () => [];
	vi.useRealTimers();
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

describe("word taps", () => {
	it("reports a press-and-release on a word with the word as read", () => {
		const h = setUp();
		tap(word(10));
		tap(word(11), "mouse");
		expect(h.onWordTap.mock.calls).toEqual([
			[10, "Alpha"],
			[11, "Beta"],
		]);
	});

	it("takes a touch tap whose click comes in a later task, after timers ran", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		pointer(word(10), "pointerup");
		vi.runAllTimers();
		click(word(10));
		expect(h.onWordTap).toHaveBeenCalledWith(10, "Alpha");
	});

	it("ignores a click with no press before it, as an accessibility activation sends", () => {
		const h = setUp();
		click(word(10));
		expect(h.onWordTap).not.toHaveBeenCalled();
	});

	it("ignores a click on a different word than the press", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		pointer(word(10), "pointerup");
		click(word(11));
		expect(h.onWordTap).not.toHaveBeenCalled();
	});

	it("does not let a tap vouch for a later click", () => {
		const h = setUp();
		tap(word(10));
		click(word(10));
		expect(h.onWordTap).toHaveBeenCalledTimes(1);
	});

	it("ignores a click long after the release", () => {
		const h = setUp();
		const at = (event: Event, ms: number) => {
			Object.defineProperty(event, "timeStamp", { value: ms });
			return event;
		};
		pointer(word(10), "pointerdown");
		word(10).dispatchEvent(
			at(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }), 0),
		);
		word(10).dispatchEvent(at(new MouseEvent("click", { bubbles: true }), 5000));
		expect(h.onWordTap).not.toHaveBeenCalled();
	});

	it("drops the press when the pointer is cancelled (a scroll took over)", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		pointer(word(10), "pointercancel");
		click(word(10));
		expect(h.onWordTap).not.toHaveBeenCalled();
	});

	it("counts a touch beside a word, on its paragraph, as a tap on that word", () => {
		const h = setUp();
		underPoint = (x) => (x > 100 ? [word(11), byId("para")] : [byId("para")]);
		pointer(byId("para"), "pointerdown", { x: 96 });
		pointer(byId("para"), "pointerup", { x: 96 });
		click(byId("para"));
		expect(h.onWordTap).toHaveBeenCalledWith(11, "Beta");
	});

	it("leaves words outside a registered reader alone, and serves every registered one", () => {
		const h = setUp();
		const other = handlers();
		unregisters.push(registerWordGestureRoot(byId("other"), () => other));
		tap(word(99));
		tap(word(50));
		expect(h.onWordTap).not.toHaveBeenCalled();
		expect(other.onWordTap).toHaveBeenCalledWith(50, "Gamma");
	});
});

describe("long press", () => {
	it("fires after the hold and marks the pointer", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(h.onWordLongPress).toHaveBeenCalledWith(10);
		expect(hasLongPressFiredFor(1)).toBe(true);
		pointer(word(10), "pointerup");
		expect(hasLongPressFiredFor(1)).toBe(false);
	});

	it("swallows the trailing click, but only that one", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		vi.advanceTimersByTime(LONG_PRESS_MS);
		pointer(word(10), "pointerup");
		click(word(10));
		expect(h.onWordTap).not.toHaveBeenCalled();
		tap(word(11));
		expect(h.onWordTap).toHaveBeenCalledWith(11, "Beta");
	});

	it("disarms the swallow on the next press when no trailing click came (Android)", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		vi.advanceTimersByTime(LONG_PRESS_MS);
		pointer(word(10), "pointerup");
		tap(word(11));
		expect(h.onWordTap).toHaveBeenCalledWith(11, "Beta");
	});

	it("extends the selection while the finger moves after it fired", () => {
		const h = setUp();
		underPoint = () => [word(11)];
		pointer(word(10), "pointerdown");
		vi.advanceTimersByTime(LONG_PRESS_MS);
		pointer(document.body, "pointermove", { x: 40 });
		expect(h.onWordLongPressDrag).toHaveBeenCalledWith(11);
	});

	it("is cancelled by moving past the threshold", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		pointer(document.body, "pointermove", { x: 20 });
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(h.onWordLongPress).not.toHaveBeenCalled();
	});

	it("is cancelled by cancelAnyActiveLongPress", () => {
		const h = setUp();
		pointer(word(11), "pointerdown");
		cancelAnyActiveLongPress();
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(h.onWordLongPress).not.toHaveBeenCalled();
	});

	it("ignores another pointer's movement", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		pointer(document.body, "pointermove", { pointerId: 2, x: 40 });
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(h.onWordLongPress).toHaveBeenCalledWith(10);
	});

	it("is replaced by a new press while still pending", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		pointer(word(11), "pointerdown", { pointerId: 2 });
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(h.onWordLongPress.mock.calls).toEqual([[11]]);
	});

	it("survives a second finger once fired, so the selection drag goes on", () => {
		const h = setUp();
		pointer(word(10), "pointerdown");
		vi.advanceTimersByTime(LONG_PRESS_MS);
		pointer(word(11), "pointerdown", { pointerId: 2 });
		expect(hasLongPressFiredFor(1)).toBe(true);
		expect(h.onWordLongPress).toHaveBeenCalledTimes(1);
	});

	it("hands a mouse drag to onWordMouseDragStart, untouched by cancelAnyActiveLongPress", () => {
		const h = setUp();
		pointer(word(10), "pointerdown", { pointerType: "mouse" });
		cancelAnyActiveLongPress();
		pointer(document.body, "pointermove", { pointerType: "mouse", x: 20 });
		expect(h.onWordMouseDragStart).toHaveBeenCalledWith(10, expect.any(PointerEvent));
		expect(h.onWordLongPress).not.toHaveBeenCalled();
	});
});
