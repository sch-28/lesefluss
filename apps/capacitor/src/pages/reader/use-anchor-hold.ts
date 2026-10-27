import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { VListHandle } from "virtua";
import { publishHoldPhase } from "../../test-hooks/reader";
import { isOnTopEdge, listItemOf, offsetFromTop, scrollOntoTopEdge, whenStill } from "./top-edge";

// Longer than VList's 150ms scroll-end debounce and its 150ms re-target window.
const QUIET_MS = 300;
// Corrections per hold, misses included: a word that cannot reach the top (the
// end of the book) or a layout that keeps flip-flopping is let go.
const MAX_CORRECTIONS = 12;
// A layout that never goes quiet (an animation) must not hold saves off forever.
const MAX_BUSY_MS = 10_000;
// A finger resting on a word to tap it, or a mouse press before a drag, moves a few px.
const TOUCH_SLOP_PX = 10;
const MOUSE_SLOP_PX = 8;
// Keys the browser scrolls with natively when the reader's shortcuts leave them
// alone (focus on a control in the text).
export const NATIVE_SCROLL_KEYS = new Set([
	" ",
	"PageUp",
	"PageDown",
	"ArrowUp",
	"ArrowDown",
	"Home",
	"End",
]);
// Native key scrolls are smooth, so the scroll comes later; at a frame a second,
// about a second later.
const KEY_SCROLL_WINDOW_MS = 2000;
// How closely the held word must follow the scroll offset to have been scrolled with
// it; a scroll this short could also be VList compensating a sub-pixel re-measure.
const MOVE_MATCH_PX = 1.5;
// After our own scroll, VList still compensates the paragraph cut by the top edge.
const OWN_SCROLL_SETTLE_MS = 150;

/**
 * Why a hold ends. `reader`: their own input, so their next scroll end is theirs
 * to save. `others`: someone else scrolled (a screen reader, find-in-page, focus
 * moving). `programmatic`: a jump or a followed voice takes over.
 */
export type HoldEnd = "reader" | "others" | "programmatic";

interface Options {
	listRef: RefObject<VListHandle | null>;
	containerRef: RefObject<HTMLElement | null>;
	/** Every input that changes how text wraps, joined into one string. */
	layoutKey: string;
	/** The word the reader is on, or null to leave the view where the reflow puts it. */
	getAnchorWord: () => number | null;
	findParagraphIndexForWord: (word: number) => number;
	/** The element to align for `word` (its span, or the heading it is in), or null when not mounted. */
	findWordSpan: (word: number, paragraphIndex: number) => HTMLElement | null;
	/** True when `word` opens a paragraph with an inline chapter title, which stays on screen. */
	isHeadedParagraphStart: (word: number, paragraphIndex: number) => boolean;
	isInitialScrollSettled: () => boolean;
	/** Stops the view's own in-flight scrolls (a jump's fine align, a followed voice). */
	cancelViewScrolls: () => void;
	/** The hold ended for the reader's own input. */
	onReaderInput?: () => void;
}

/**
 * Keeps an anchor word's line on the top edge while VList re-measures
 * paragraphs and shifts the scroll offset, so the shift is never saved:
 * - after a reflow (a layout setting, here or via sync, or a width change),
 *   aiming the reader's word back onto the edge;
 * - after an open or a jump has landed (`holdAnchor`), correcting late shifts.
 * It lasts until the reader's own input, someone else's scroll, or a jump.
 * While `isPending()` the caller must not save or report progress from scroll events.
 */
export function useAnchorHold(options: Options) {
	const optionsRef = useRef(options);
	optionsRef.current = options;
	// settling: aiming until the word is on the top edge. holding: on it, and kept
	// there. VList compensates the offset each time a never-measured paragraph above
	// mounts for the first time, which goes on for seconds after it looks quiet and
	// without a render.
	const phaseRef = useRef<"idle" | "settling" | "holding">("idle");
	const deferredRef = useRef(false);
	const wordRef = useRef<number | null>(null);
	const correctionsRef = useRef(0);
	const busySinceRef = useRef<number | null>(null);
	const quietTimerRef = useRef(0);
	const cancelStillRef = useRef<(() => void) | null>(null);
	// Where the held word and the scroll offset were at the last scroll event, to
	// tell VList's compensation (the word stays) from someone scrolling (it moves along).
	const lastRef = useRef<{ top: number; word: number | null }>({ top: 0, word: null });
	// Scrolling we started: the landing align (until the word is first found on the
	// edge) and the px of corrections not yet seen in a scroll event.
	const landingRef = useRef(false);
	const ownDeltaRef = useRef(0);
	const ownScrollAtRef = useRef(Number.NEGATIVE_INFINITY);
	const resizedAtRef = useRef(Number.NEGATIVE_INFINITY);
	// A correction whose scroll never came: the word cannot get closer (the end of
	// the book), so the hold only watches from then on.
	const stuckRef = useRef(false);
	// Native scrolling with no event telling it from a click (a mouse press on the
	// scrollbar or a selection dragged past the edge, middle-click autoscroll, a
	// native scroll key) is the reader's until this time; Infinity while pressed.
	const readerInputUntilRef = useRef(0);

	const api = useMemo(() => {
		const setPhase = (phase: "idle" | "settling" | "holding") => {
			phaseRef.current = phase;
			if (import.meta.env.DEV) publishHoldPhase(phase);
		};

		const scroller = () =>
			optionsRef.current.containerRef.current?.firstElementChild as HTMLElement | null | undefined;

		/**
		 * One scrollToIndex with the word's offset inside its paragraph: VList keeps
		 * re-targeting it while the paragraphs above are re-measured, which a fixed
		 * scrollBy cannot. Without a mounted span, the paragraph start.
		 */
		const aim = (word: number) => {
			const o = optionsRef.current;
			const list = o.listRef.current;
			const container = o.containerRef.current;
			if (!list || !container) return;
			const idx = o.findParagraphIndexForWord(word);
			const span = o.isHeadedParagraphStart(word, idx) ? null : o.findWordSpan(word, idx);
			const item = span && listItemOf(span, container);
			if (!span || !item) {
				list.scrollToIndex(idx, { align: "start" });
				return;
			}
			const offset = offsetFromTop(span, container) - offsetFromTop(item, container);
			list.scrollToIndex(idx, { align: "start", offset: scrollOntoTopEdge(offset) });
		};

		// The paragraph's top, not the word, when an inline chapter title opens it.
		const targetOffset = (word: number): number | null => {
			const o = optionsRef.current;
			const container = o.containerRef.current;
			const idx = o.findParagraphIndexForWord(word);
			const span = container && o.findWordSpan(word, idx);
			if (!container || !span) return null;
			const target = o.isHeadedParagraphStart(word, idx) ? listItemOf(span, container) : span;
			return target ? offsetFromTop(target, container) : null;
		};

		const remember = (word: number) => {
			lastRef.current = { top: scroller()?.scrollTop ?? 0, word: targetOffset(word) };
		};

		const stopQuiet = () => {
			clearTimeout(quietTimerRef.current);
			cancelStillRef.current?.();
			quietTimerRef.current = 0;
			cancelStillRef.current = null;
		};

		const armQuiet = () => {
			stopQuiet();
			const now = performance.now();
			busySinceRef.current ??= now;
			if (now - busySinceRef.current > MAX_BUSY_MS) {
				release("programmatic");
				return;
			}
			quietTimerRef.current = window.setTimeout(() => {
				const word = wordRef.current;
				if (word === null) return;
				cancelStillRef.current = whenStill(() => targetOffset(word), onQuiet);
			}, QUIET_MS);
		};

		const onQuiet = () => {
			cancelStillRef.current = null;
			busySinceRef.current = null;
			const word = wordRef.current;
			if (word === null) return;
			landingRef.current = false;
			if (ownDeltaRef.current !== 0) stuckRef.current = true;
			ownDeltaRef.current = 0;
			remember(word);
			const offset = targetOffset(word);
			if (offset !== null && isOnTopEdge(offset)) {
				setPhase("holding");
				return;
			}
			if (stuckRef.current && phaseRef.current === "holding") return;
			if (correctionsRef.current >= MAX_CORRECTIONS) {
				release("programmatic");
				return;
			}
			// Held words were on the edge and are only nudged back; VList's
			// compensation never unmounts them, so an unmounted one was scrolled away.
			if (phaseRef.current === "holding" && offset === null) {
				release("others");
				return;
			}
			correctionsRef.current++;
			// From where it visibly is: the item offsets VList targets can disagree
			// with the rendered ones (a chapter title next to it), and repeat the miss.
			const list = optionsRef.current.listRef.current;
			if (offset !== null && list) {
				const delta = scrollOntoTopEdge(offset);
				ownDeltaRef.current += delta;
				list.scrollBy(delta);
			} else aim(word);
			armQuiet();
		};

		const release = (reason: HoldEnd) => {
			const wasPending = phaseRef.current !== "idle";
			stopQuiet();
			wordRef.current = null;
			setPhase("idle");
			deferredRef.current = false;
			if (wasPending && reason === "reader") optionsRef.current.onReaderInput?.();
		};

		const begin = (phase: "settling" | "holding", word: number) => {
			setPhase(phase);
			wordRef.current = word;
			correctionsRef.current = phase === "settling" ? 1 : 0;
			busySinceRef.current = null;
			landingRef.current = true;
			ownDeltaRef.current = 0;
			stuckRef.current = false;
			readerInputUntilRef.current = 0;
			remember(word);
		};

		const start = () => {
			const o = optionsRef.current;
			if (!o.isInitialScrollSettled()) {
				deferredRef.current = true;
				return;
			}
			const word = o.getAnchorWord();
			if (word === null) {
				release("programmatic");
				return;
			}
			o.cancelViewScrolls();
			release("programmatic");
			begin("settling", word);
			aim(word);
			armQuiet();
		};

		/** How a scroll event moved the held word: with the scroll, or not. */
		const classify = (now: {
			top: number;
			word: number | null;
		}): "own" | "compensation" | "others" | "shift" => {
			const last = lastRef.current;
			const scrolled = now.top - last.top;
			if (landingRef.current) return "own";
			if (ownDeltaRef.current !== 0 && Math.sign(scrolled) === Math.sign(ownDeltaRef.current)) {
				return "own";
			}
			if (now.word === null || last.word === null) return "others";
			const moved = now.word - last.word;
			if (Math.abs(moved) < MOVE_MATCH_PX) return "compensation";
			const withScroll =
				Math.abs(scrolled) >= 2 * MOVE_MATCH_PX && Math.abs(moved + scrolled) < MOVE_MATCH_PX;
			if (!withScroll) return "shift";
			// Our scroll's trailing compensation while the paragraph is still growing
			// below the word looks the same; that is a shift to correct.
			const t = performance.now();
			const settlingOwn =
				t - ownScrollAtRef.current < OWN_SCROLL_SETTLE_MS &&
				t - resizedAtRef.current < OWN_SCROLL_SETTLE_MS;
			return settlingOwn ? "shift" : "others";
		};

		return {
			start,
			release,
			/** While true, scrolls are the list re-measuring: nothing may be saved from them. */
			isPending: () => phaseRef.current !== "idle",
			isSettling: () => phaseRef.current === "settling",
			/** A press, an autoscroll or a scroll key is moving the list. */
			isReaderInput: () => performance.now() < readerInputUntilRef.current,
			noteScroll: () => {
				const word = wordRef.current;
				if (phaseRef.current === "idle" || word === null) return;
				const until = readerInputUntilRef.current;
				if (performance.now() < until) {
					// A key's window covers its one scroll; a press lasts until it is let go.
					if (until !== Number.POSITIVE_INFINITY) readerInputUntilRef.current = 0;
					release("reader");
					return;
				}
				const now = { top: scroller()?.scrollTop ?? 0, word: targetOffset(word) };
				const kind = phaseRef.current === "holding" ? classify(now) : "shift";
				if (kind === "own" && ownDeltaRef.current !== 0) {
					const left = ownDeltaRef.current - (now.top - lastRef.current.top);
					ownDeltaRef.current = Math.sign(left) === Math.sign(ownDeltaRef.current) ? left : 0;
					ownScrollAtRef.current = performance.now();
				}
				lastRef.current = now;
				if (kind === "others") release("others");
				else armQuiet();
			},
			/** The content's size changed: VList measured a paragraph, maybe without scrolling. */
			noteResize: () => {
				resizedAtRef.current = performance.now();
				if (phaseRef.current !== "idle") armQuiet();
			},
			onInitialScrollSettled: () => {
				if (!deferredRef.current) return;
				deferredRef.current = false;
				start();
			},
			/**
			 * Holds `word`, which an align has just sent to the top edge (its scroll
			 * may not have landed yet), without aiming again: VList's late
			 * measurements after an open or a jump are corrected, never saved.
			 */
			holdAnchor: (word: number) => {
				if (phaseRef.current !== "idle") return;
				begin("holding", word);
				armQuiet();
			},
		};
	}, []);

	const lastLayoutKeyRef = useRef(options.layoutKey);
	// A layout effect: saves must be held before the reflow's first scroll event.
	useLayoutEffect(() => {
		if (lastLayoutKeyRef.current === options.layoutKey) return;
		lastLayoutKeyRef.current = options.layoutKey;
		api.start();
	}, [options.layoutKey, api]);

	const { containerRef } = options;
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		let width = 0;
		// Started from the observer, not via state: a render would come after the
		// reflow's scroll events had already reported a drifted word.
		const observer = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect.width ?? 0;
			// Zero while hidden or detached during a transition; not a reflow to follow.
			if (next === 0 || next === width) return;
			const isFirst = width === 0;
			width = next;
			if (!isFirst) api.start();
		});
		observer.observe(el);
		const content = new ResizeObserver(() => api.noteResize());
		const inner = el.firstElementChild?.firstElementChild;
		if (inner) content.observe(inner);

		const handBack = () => api.release("reader");
		const press = () => {
			readerInputUntilRef.current = Number.POSITIVE_INFINITY;
		};
		let autoscrolling = false;
		const endAutoscroll = () => {
			if (!autoscrolling) return;
			autoscrolling = false;
			readerInputUntilRef.current = 0;
		};
		const onWheel = () => {
			endAutoscroll();
			handBack();
		};
		let touchStartY = 0;
		const onTouchStart = (e: TouchEvent) => {
			touchStartY = e.touches[0]?.clientY ?? 0;
		};
		// A long press (selection, the context menu) moves less than this and keeps the hold.
		const onTouchMove = (e: TouchEvent) => {
			const y = e.touches[0]?.clientY ?? touchStartY;
			if (Math.abs(y - touchStartY) > TOUCH_SLOP_PX) handBack();
		};
		let mousePress: { x: number; y: number } | null = null;
		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return;
			mousePress = { x: e.clientX, y: e.clientY };
			const list = el.firstElementChild;
			// On the scrollbar, not the side margins or bottom padding of the same element.
			const onScrollbar = !!list && e.target === list && e.offsetX >= list.clientWidth;
			// Middle-click autoscroll goes on after the button is up, until the next input.
			if (e.button === 1) autoscrolling = true;
			if (onScrollbar || autoscrolling) press();
		};
		const onPointerMove = (e: PointerEvent) => {
			if (!mousePress) return;
			const moved = Math.hypot(e.clientX - mousePress.x, e.clientY - mousePress.y);
			// A selection dragged past the edge scrolls the list.
			if (moved > MOUSE_SLOP_PX) press();
		};
		const letGo = () => {
			mousePress = null;
			if (!autoscrolling && readerInputUntilRef.current === Number.POSITIVE_INFINITY) {
				readerInputUntilRef.current = 0;
			}
		};
		const onWindowBlur = () => {
			endAutoscroll();
			letGo();
		};
		// A key the reader's shortcuts consumed scrolls through the view handle, which
		// ends the hold itself. Decided once the event has gone through every listener,
		// whatever order they were added in.
		const onKeyDown = (e: KeyboardEvent) => {
			if (!NATIVE_SCROLL_KEYS.has(e.key)) return;
			const target = e.target instanceof Node ? e.target : null;
			const onPage = !target || target === document.body || target === document.documentElement;
			if (!onPage && !el.contains(target)) return;
			setTimeout(() => {
				if (!e.defaultPrevented) {
					readerInputUntilRef.current = performance.now() + KEY_SCROLL_WINDOW_MS;
				}
			}, 0);
		};
		// Window, capturing: a handler that stops propagation (the discussion marker
		// on pointerup) must not leave a press stuck.
		const captured = [
			["pointerdown", endAutoscroll],
			["pointermove", onPointerMove],
			["pointerup", letGo],
			["pointercancel", letGo],
			["contextmenu", letGo],
			["keydown", endAutoscroll],
		] as const;
		// Focus moving into the text scrolls it into view (Tab, a screen reader).
		const onFocusIn = () => api.release("others");
		el.addEventListener("wheel", onWheel, { passive: true });
		el.addEventListener("touchstart", onTouchStart, { passive: true });
		el.addEventListener("touchmove", onTouchMove, { passive: true });
		el.addEventListener("pointerdown", onPointerDown, { capture: true });
		el.addEventListener("focusin", onFocusIn);
		for (const [type, listener] of captured) {
			window.addEventListener(type, listener as EventListener, { capture: true, passive: true });
		}
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("blur", onWindowBlur);
		return () => {
			observer.disconnect();
			content.disconnect();
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("touchstart", onTouchStart);
			el.removeEventListener("touchmove", onTouchMove);
			el.removeEventListener("pointerdown", onPointerDown, { capture: true });
			el.removeEventListener("focusin", onFocusIn);
			for (const [type, listener] of captured) {
				window.removeEventListener(type, listener as EventListener, { capture: true });
			}
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("blur", onWindowBlur);
			readerInputUntilRef.current = 0;
		};
	}, [containerRef, api]);

	useEffect(() => () => api.release("programmatic"), [api]);

	return api;
}
