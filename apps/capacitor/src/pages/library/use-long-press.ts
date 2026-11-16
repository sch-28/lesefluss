import { useCallback, useRef } from "react";

const DEFAULT_LONG_PRESS_MS = 400;

type LongPressHandlers = {
	onTouchStart: (e: React.TouchEvent) => void;
	onTouchEnd: () => void;
	onTouchCancel: () => void;
	onTouchMove: () => void;
	onClick: (e: React.MouseEvent) => void;
	onContextMenu: (e: React.MouseEvent) => void;
};

interface Options {
	/** The click, so a caller can read Shift / Ctrl / Cmd. */
	onTap: (e: React.MouseEvent) => void;
	/** Right-click, and a long press unless `onLongPress` is given. */
	onMenu: () => void;
	onLongPress?: () => void;
	durationMs?: number;
	/** False: taps still work, but a hold and a right-click do nothing. */
	enabled?: boolean;
}

/**
 * Tap vs. long-press dispatcher for grid cards. Returns a bag of event
 * handlers to spread onto the root element.
 *
 *   Short tap   (< durationMs) → onTap
 *   Long press  (≥ durationMs) → onLongPress, else onMenu
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
	enabled = true,
	onLongPress,
}: Options): LongPressHandlers {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const firedRef = useRef(false);
	const latchedTapRef = useRef<Options["onTap"] | null>(null);
	const touchingRef = useRef(false);

	const cancelTimer = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const onTouchStart = useCallback(
		(e: React.TouchEvent) => {
			if (e.touches.length !== 1) return;
			touchingRef.current = true;
			// `firedRef` stays false when disabled, so the click the browser
			// synthesises after touchend still reaches `onTap`: a long hold in
			// selection mode toggles the card on release rather than doing nothing.
			firedRef.current = false;
			// Latch what a tap means for the whole gesture. A bulk action finishing
			// mid-hold flips the card out of selection mode, and without this the
			// release would run the new meaning and open the reader on a book the
			// reader was only deselecting.
			latchedTapRef.current = onTap;
			if (!enabled) return;
			timerRef.current = setTimeout(() => {
				firedRef.current = true;
				(onLongPress ?? onMenu)();
			}, durationMs);
		},
		[onMenu, onLongPress, onTap, durationMs, enabled],
	);

	const onClick = useCallback(
		(e: React.MouseEvent) => {
			cancelTimer();
			const latched = latchedTapRef.current;
			latchedTapRef.current = null;
			if (firedRef.current) {
				firedRef.current = false;
				return;
			}
			// No latch means a mouse click that never went through touchstart.
			(latched ?? onTap)(e);
		},
		[cancelTimer, onTap],
	);

	const onContextMenu = useCallback(
		(e: React.MouseEvent) => {
			// Suppressed even when disabled, or a desktop right-click would raise the
			// browser's own menu over the grid.
			e.preventDefault();
			// Android fires contextmenu for a held finger too; the timer owns touch,
			// or a long press meant to select would also open the menu.
			if (enabled && !touchingRef.current) onMenu();
		},
		[onMenu, enabled],
	);

	const endTouch = useCallback(() => {
		touchingRef.current = false;
		cancelTimer();
	}, [cancelTimer]);

	return {
		onTouchStart,
		onTouchEnd: endTouch,
		onTouchCancel: endTouch,
		onTouchMove: cancelTimer,
		onClick,
		onContextMenu,
	};
}
