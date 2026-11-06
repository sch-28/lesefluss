import { useEffect, useRef } from "react";

const EDGE_PX = 56;
const EDGE_SCROLL_PX = 14;

/** The id of the book card under a point, if any. */
export function bookIdAt(x: number, y: number): string | null {
	const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-book-id]");
	return el?.dataset.bookId ?? null;
}

/** How far to scroll for a finger this close to the scroller's top or bottom edge. */
export function edgeScrollStep(y: number, top: number, bottom: number): number {
	if (y < top + EDGE_PX) return -EDGE_SCROLL_PX;
	if (y > bottom - EDGE_PX) return EDGE_SCROLL_PX;
	return 0;
}

type Options = {
	isActive: boolean;
	onOver: (bookId: string) => void;
	onEnd: () => void;
};

/**
 * While a drag-select runs (started by a long press), follows the finger across
 * covers and stops the page from scrolling under it; otherwise touches scroll
 * as usual. Scrolls the list when the finger nears its top or bottom edge.
 */
export function useDragSelect(
	containerRef: React.RefObject<HTMLElement | null>,
	{ isActive, onOver, onEnd }: Options,
) {
	const handlers = useRef({ onOver, onEnd });
	handlers.current = { onOver, onEnd };
	const activeRef = useRef(isActive);
	activeRef.current = isActive;

	// Registered for the page's whole life: Chrome decides at touchstart whether
	// a touch's moves can be cancelled, so a listener added once the long press
	// fires would come too late to stop that touch's scroll.
	useEffect(() => {
		const onMove = (e: TouchEvent) => {
			const touch = e.touches[0];
			if (!activeRef.current || !touch) return;
			e.preventDefault();
			const scroller = containerRef.current?.closest<HTMLElement>(
				'[data-scroll-restoration-id="app-scroll"]',
			);
			if (scroller) {
				const rect = scroller.getBoundingClientRect();
				const step = edgeScrollStep(touch.clientY, rect.top, rect.bottom);
				if (step) scroller.scrollBy(0, step);
			}
			const id = bookIdAt(touch.clientX, touch.clientY);
			if (id) handlers.current.onOver(id);
		};
		window.addEventListener("touchmove", onMove, { passive: false });
		return () => window.removeEventListener("touchmove", onMove);
	}, [containerRef]);

	useEffect(() => {
		const container = containerRef.current;
		if (!isActive || !container) return;
		const previousTouchAction = container.style.touchAction;
		container.style.touchAction = "none";
		const onUp = () => handlers.current.onEnd();
		// A lift that came before this effect ran would leave the drag on; the
		// next gesture must not extend it.
		window.addEventListener("touchstart", onUp);
		window.addEventListener("touchend", onUp);
		window.addEventListener("touchcancel", onUp);
		return () => {
			container.style.touchAction = previousTouchAction;
			window.removeEventListener("touchstart", onUp);
			window.removeEventListener("touchend", onUp);
			window.removeEventListener("touchcancel", onUp);
		};
	}, [containerRef, isActive]);
}
