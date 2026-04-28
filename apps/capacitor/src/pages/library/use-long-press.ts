import { useCallback, useRef } from "react";

const DEFAULT_LONG_PRESS_MS = 400;

type LongPressHandlers = {
	onTouchStart: (e: React.TouchEvent) => void;
	onTouchEnd: () => void;
	onTouchCancel: () => void;
	onTouchMove: () => void;
	onClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
};

interface Options {
	onTap: () => void;
	onMenu: () => void;
	durationMs?: number;
}

/**
 * Tap vs. long-press dispatcher for grid cards. Returns a bag of event
 * handlers to spread onto the root element.
 *
 *   Short tap   (< durationMs) → onTap
 *   Long press  (≥ durationMs) → onMenu
 *
 * Touch devices synthesize a click after touchend, so the synthetic click
 * fires `onTap` for both touch and mouse. The touch handlers only drive the
 * long-press timer; `firedRef` ensures the post-long-press click is swallowed.
 *
 * `onContextMenu` mirrors long-press for desktop browsers (right-click) and
 * suppresses the default browser menu.
 *
 * `onTouchMove` cancels the timer so scrolling the grid never triggers
 * `onMenu` even if the finger started on a card.
 */
export function useLongPress({
	onTap,
	onMenu,
	durationMs = DEFAULT_LONG_PRESS_MS,
}: Options): LongPressHandlers {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const firedRef = useRef(false);

	const cancelTimer = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const onTouchStart = useCallback(
		(e: React.TouchEvent) => {
			if (e.touches.length !== 1) return;
			firedRef.current = false;
			timerRef.current = setTimeout(() => {
				firedRef.current = true;
				onMenu();
			}, durationMs);
		},
		[onMenu, durationMs],
	);

	const onClick = useCallback(() => {
		cancelTimer();
		if (firedRef.current) {
			firedRef.current = false;
			return;
		}
		onTap();
	}, [cancelTimer, onTap]);

	const onContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			onMenu();
		},
		[onMenu],
	);

	return {
		onTouchStart,
		onTouchEnd: cancelTimer,
		onTouchCancel: cancelTimer,
		onTouchMove: cancelTimer,
		onClick,
		onContextMenu,
	};
}
