import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { dragStep } from "../../services/haptics";
import { steppedWpm, type WpmRange } from "./wpm";

export const SWIPE_STEP_PX = 40;
/** Movement under this is still a tap that pauses. */
export const SWIPE_SLOP_PX = 10;
const FLASH_MS = 700;

/** Whole speed steps a vertical drag of `dy` px has crossed; up (negative dy) is faster. */
export function swipeSteps(dy: number, stepPx = SWIPE_STEP_PX): number {
	return Math.trunc(-dy / stepPx) + 0;
}

/** `steps` range steps away from `base`, clamped to the range. */
export function wpmAfterSteps(base: number, steps: number, range: WpmRange): number {
	let wpm = base;
	for (let i = 0; i < Math.abs(steps); i++) wpm = steppedWpm(wpm, range, steps > 0 ? 1 : -1);
	return wpm;
}

type Drag = { pointerId: number; startY: number; baseWpm: number; wpm: number; isSwipe: boolean };

/**
 * Vertical swipe on the playing RSVP display to change speed without pausing.
 * The drag steps from the speed at pointer down, so a settings write that lands
 * late can't pull the next step back.
 */
export function useRsvpSwipe({
	isEnabled,
	wpm,
	range,
	onChange,
	onSwipeStart,
}: {
	isEnabled: boolean;
	wpm: number;
	range: WpmRange;
	onChange: (wpm: number) => void;
	/** touch-action none means no pointercancel ends a pending long-press; this does. */
	onSwipeStart?: () => void;
}) {
	const dragRef = useRef<Drag | null>(null);
	// Set when a drag became a swipe, so the click that follows it doesn't pause.
	const swallowClickRef = useRef(false);
	const [isFlashing, setFlashing] = useState(false);
	const flashTimerRef = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
		},
		[],
	);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			swallowClickRef.current = false;
			dragRef.current =
				isEnabled && e.isPrimary
					? { pointerId: e.pointerId, startY: e.clientY, baseWpm: wpm, wpm, isSwipe: false }
					: null;
		},
		[isEnabled, wpm],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || e.pointerId !== drag.pointerId) return;
			const dy = e.clientY - drag.startY;
			if (!drag.isSwipe) {
				if (Math.abs(dy) <= SWIPE_SLOP_PX) return;
				drag.isSwipe = true;
				onSwipeStart?.();
			}
			const next = wpmAfterSteps(drag.baseWpm, swipeSteps(dy), range);
			if (next === drag.wpm) return;
			drag.wpm = next;
			onChange(next);
			dragStep();
			setFlashing(true);
			if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
			flashTimerRef.current = window.setTimeout(() => setFlashing(false), FLASH_MS);
		},
		[range, onChange, onSwipeStart],
	);

	const onPointerEnd = useCallback(() => {
		if (dragRef.current?.isSwipe) swallowClickRef.current = true;
		dragRef.current = null;
	}, []);

	/** True once for the click a swipe produced. */
	const consumeSwipeClick = useCallback(() => {
		const swallow = swallowClickRef.current;
		swallowClickRef.current = false;
		return swallow;
	}, []);

	return { onPointerDown, onPointerMove, onPointerEnd, consumeSwipeClick, isFlashing };
}
