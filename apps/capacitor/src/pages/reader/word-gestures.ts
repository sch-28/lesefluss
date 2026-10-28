/**
 * Word taps and long presses on book text, from one pointerdown and one click
 * listener on document instead of handlers on every word span. Chromium
 * exposes an element with a click listener (React adds a no-op onclick for
 * every onClick) as clickable, so TalkBack stopped on each word, and would read
 * all the text under a clickable container as one node. With the listeners on
 * document, every paragraph is plain text that TalkBack reads whole.
 *
 * A click counts as a word tap only when it follows this module's own
 * pointerdown on the same word. An accessibility activation (a TalkBack
 * double-tap) clicks with no pointerdown before it, and must not move the
 * reading position.
 */

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { LONG_PRESS_MS } from "./long-press";
import { wordIndexAt } from "./word-at-point";

export type WordGestureHandlers = {
	onWordTap: (wordIdx: number, wordText: string) => void;
	onWordLongPress?: (wordIdx: number) => void;
	/** Finger still down after a long press, now over `wordIdx`. */
	onWordLongPressDrag?: (wordIdx: number) => void;
	onWordMouseDragStart?: (wordIdx: number, event: PointerEvent) => void;
};

const DRAG_THRESHOLD_PX = 8;
// A touch tap's click comes from a gesture event in a later task, held until the
// touchend is acknowledged, so the press must outlive the pointerup by this much.
const CLICK_AFTER_RELEASE_MS = 1000;
// Chromium snaps a near-miss tap only onto click-responsive nodes, which the
// spans no longer are; a press this close to a word still counts as on it.
const NEAR_MISS_PX = 8;

const roots = new Map<Element, () => WordGestureHandlers>();

type Hit = { span: HTMLElement; word: number; handlers: WordGestureHandlers };

function hitOf(span: HTMLElement | null): Hit | null {
	if (!span) return null;
	const word = Number.parseInt(span.dataset.word ?? "", 10);
	if (Number.isNaN(word)) return null;
	for (const [root, handlers] of roots) {
		if (root.contains(span)) return { span, word, handlers: handlers() };
	}
	return null;
}

const spanOf = (target: EventTarget | null) =>
	target instanceof Element ? target.closest<HTMLElement>("span[data-word]") : null;

/** The word span within NEAR_MISS_PX of a point that landed beside the words. */
function spanNear(x: number, y: number): HTMLElement | null {
	const offsets = [
		[NEAR_MISS_PX / 2, 0],
		[-NEAR_MISS_PX / 2, 0],
		[NEAR_MISS_PX, 0],
		[-NEAR_MISS_PX, 0],
		[0, NEAR_MISS_PX / 2],
		[0, -NEAR_MISS_PX / 2],
	];
	for (const [dx, dy] of offsets) {
		const word = wordIndexAt(x + dx, y + dy);
		if (word !== null) return document.querySelector<HTMLElement>(`span[data-word="${word}"]`);
	}
	return null;
}

/** The word as read, without the glossary avatar's initial rendered inside its span. */
function wordTextOf(span: HTMLElement): string {
	let text = "";
	for (const node of span.childNodes) {
		if (node instanceof Element && node.classList.contains("glossary-inline-avatar")) continue;
		text += node.textContent ?? "";
	}
	return text;
}

// The pointer press a click must follow to be a tap: the next pointerdown, a
// cancel or the click it produced ends it, and a click long after the release
// finds it expired, so a click with no press of its own (an accessibility
// activation) finds nothing.
let press: {
	span: HTMLElement;
	/** What the pointer landed on: the span, or the paragraph beside it for a near miss. */
	target: EventTarget | null;
	pointerId: number;
	releasedAt: number | null;
} | null = null;

// At most one long press is pending or held at a time.
let gesture: {
	pointerId: number;
	hasFired: boolean;
	isPending: () => boolean;
	cleanup: () => void;
} | null = null;

// The trailing-click swallow a fired long press leaves armed.
let disarmSwallow: (() => void) | null = null;

/** Drops a touch long press still counting down (the gesture became a swipe or
 *  a scroll). A mouse press has no countdown: its drag becomes a selection. */
export function cancelAnyActiveLongPress(): void {
	if (gesture?.isPending()) gesture.cleanup();
}

/** Whether `pointerId`'s long press fired and its finger is still down, so
 *  gesture handlers elsewhere (page-view swipes) yield to the selection drag. */
export function hasLongPressFiredFor(pointerId: number): boolean {
	return gesture?.hasFired === true && gesture.pointerId === pointerId;
}

function armSwallow(): void {
	disarmSwallow?.();
	// Swallow the trailing click from the same pointer sequence so the tap
	// handler doesn't cancel the just-started selection. Android WebView sends
	// no such click, so disarm on the next pointerdown or it eats a real tap.
	const swallow = (ce: MouseEvent) => {
		ce.stopPropagation();
		ce.preventDefault();
		disarm();
	};
	const disarm = () => {
		window.removeEventListener("click", swallow, true);
		window.removeEventListener("pointerdown", disarm, true);
		if (disarmSwallow === disarm) disarmSwallow = null;
	};
	window.addEventListener("click", swallow, { capture: true });
	window.addEventListener("pointerdown", disarm, { capture: true });
	disarmSwallow = disarm;
}

function startLongPress(ev: PointerEvent, hit: Hit): void {
	const { onWordLongPress, onWordMouseDragStart } = hit.handlers;
	if (!onWordLongPress && !onWordMouseDragStart) return;
	// A second finger must not end the first one's selection drag.
	if (gesture?.hasFired) return;
	gesture?.cleanup();
	const isMouse = ev.pointerType === "mouse";
	if (isMouse) ev.preventDefault();

	let timer: ReturnType<typeof setTimeout> | null = null;
	const startX = ev.clientX;
	const startY = ev.clientY;
	const current = {
		pointerId: ev.pointerId,
		hasFired: false,
		isPending: () => timer !== null,
		cleanup,
	};
	gesture = current;

	// Once the long press fires, the finger extends the selection, so the page
	// must not scroll underneath it.
	function blockScroll(te: TouchEvent) {
		if (current.hasFired) te.preventDefault();
	}
	function onMove(me: PointerEvent) {
		if (me.pointerId !== current.pointerId) return;
		if (current.hasFired) {
			const idx = wordIndexAt(me.clientX, me.clientY);
			if (idx !== null) hit.handlers.onWordLongPressDrag?.(idx);
			return;
		}
		const dx = Math.abs(me.clientX - startX);
		const dy = Math.abs(me.clientY - startY);
		if (dx <= DRAG_THRESHOLD_PX && dy <= DRAG_THRESHOLD_PX) return;
		cleanup();
		if (isMouse) onWordMouseDragStart?.(hit.word, me);
	}
	function onEnd(pe: PointerEvent) {
		if (pe.pointerId === current.pointerId) cleanup();
	}
	function cleanup() {
		if (timer) clearTimeout(timer);
		timer = null;
		if (gesture === current) gesture = null;
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onEnd);
		document.removeEventListener("pointercancel", onEnd);
		document.removeEventListener("touchmove", blockScroll);
	}

	if (!isMouse && onWordLongPress) {
		document.addEventListener("touchmove", blockScroll, { passive: false });
		timer = setTimeout(() => {
			timer = null;
			current.hasFired = true;
			onWordLongPress(hit.word);
			armSwallow();
		}, LONG_PRESS_MS);
	}
	document.addEventListener("pointermove", onMove);
	document.addEventListener("pointerup", onEnd);
	document.addEventListener("pointercancel", onEnd);
}

function onPointerDown(ev: PointerEvent): void {
	press = null;
	const direct = hitOf(spanOf(ev.target));
	if (direct) {
		press = { span: direct.span, target: ev.target, pointerId: ev.pointerId, releasedAt: null };
		startLongPress(ev, direct);
		return;
	}
	if (ev.pointerType === "mouse" || !(ev.target instanceof Element)) return;
	const near = hitOf(spanNear(ev.clientX, ev.clientY));
	if (near?.span.parentElement?.contains(ev.target)) {
		press = { span: near.span, target: ev.target, pointerId: ev.pointerId, releasedAt: null };
	}
}

function onPointerEnd(ev: PointerEvent): void {
	if (!press || press.pointerId !== ev.pointerId) return;
	if (ev.type === "pointercancel") press = null;
	else press.releasedAt = ev.timeStamp;
}

function onClick(ev: MouseEvent): void {
	const pressed = press;
	if (!pressed) return;
	const onPressedSpan = spanOf(ev.target) === pressed.span;
	if (!onPressedSpan && ev.target !== pressed.target) return;
	press = null;
	const isFresh =
		pressed.releasedAt !== null && ev.timeStamp - pressed.releasedAt <= CLICK_AFTER_RELEASE_MS;
	const hit = hitOf(pressed.span);
	if (isFresh && hit) hit.handlers.onWordTap(hit.word, wordTextOf(hit.span));
}

/** Routes word taps and long presses inside `root` to `handlers()`; returns the unregister. */
export function registerWordGestureRoot(
	root: Element,
	handlers: () => WordGestureHandlers,
): () => void {
	if (roots.size === 0) {
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("pointerup", onPointerEnd);
		document.addEventListener("pointercancel", onPointerEnd);
		document.addEventListener("click", onClick);
	}
	roots.set(root, handlers);
	return () => {
		roots.delete(root);
		if (roots.size > 0) return;
		document.removeEventListener("pointerdown", onPointerDown);
		document.removeEventListener("pointerup", onPointerEnd);
		document.removeEventListener("pointercancel", onPointerEnd);
		document.removeEventListener("click", onClick);
		gesture?.cleanup();
		disarmSwallow?.();
		press = null;
	};
}

/** Routes word taps and long presses inside `rootRef` to `handlers` (always the latest). */
export function useWordGestures(
	rootRef: RefObject<HTMLElement | null>,
	handlers: WordGestureHandlers,
): void {
	const handlersRef = useRef(handlers);
	useLayoutEffect(() => {
		handlersRef.current = handlers;
	});
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		return registerWordGestureRoot(root, () => handlersRef.current);
	}, [rootRef]);
}
