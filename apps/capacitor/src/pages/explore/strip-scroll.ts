import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from "react";

const FINE_POINTER = "(pointer: fine)";

function subscribePointer(onChange: () => void) {
	const mq = window.matchMedia?.(FINE_POINTER);
	mq?.addEventListener("change", onChange);
	return () => mq?.removeEventListener("change", onChange);
}

/** True with a mouse or trackpad, where a horizontal strip has no swipe to scroll it. */
export function useHasFinePointer(): boolean {
	return useSyncExternalStore(
		subscribePointer,
		() => window.matchMedia?.(FINE_POINTER).matches ?? false,
		() => false,
	);
}

/** Pages a horizontal strip by most of its width, for the arrow buttons beside it. */
export function useStripScroll(stripRef: RefObject<HTMLElement | null>) {
	const isReducedMotion = usePrefersReducedMotion();
	return (direction: 1 | -1) => {
		const el = stripRef.current;
		el?.scrollBy({
			left: direction * el.clientWidth * 0.8,
			behavior: isReducedMotion ? "auto" : "smooth",
		});
	};
}

/**
 * A horizontal scroller without a scrollbar. The app-wide 8px scrollbar appears
 * only once content overflows, so a strip grew by 8px when its items loaded.
 */
export const HIDDEN_SCROLLBAR_X =
	"overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export type StripEdges = { overflows: boolean; atStart: boolean; atEnd: boolean };

const NO_OVERFLOW: StripEdges = { overflows: false, atStart: true, atEnd: true };

/** Fractional widths leave scrollLeft a hair short of its maximum at the end. */
const EDGE_SLACK_PX = 1;

export function measureStripEdges(el: HTMLElement): StripEdges {
	const max = el.scrollWidth - el.clientWidth;
	return {
		overflows: max > EDGE_SLACK_PX,
		atStart: el.scrollLeft <= EDGE_SLACK_PX,
		atEnd: el.scrollLeft >= max - EDGE_SLACK_PX,
	};
}

/**
 * Whether the strip overflows and is scrolled to either end, kept current as it
 * scrolls, resizes or its items change. `enabled` re-measures when the strip element
 * itself is swapped in (a shelf's body giving way to its list).
 */
export function useStripEdges(
	stripRef: RefObject<HTMLElement | null>,
	enabled: boolean,
): StripEdges {
	const [edges, setEdges] = useState(NO_OVERFLOW);
	useLayoutEffect(() => {
		const el = stripRef.current;
		if (!enabled || !el) {
			setEdges(NO_OVERFLOW);
			return;
		}
		const measure = () => {
			const next = measureStripEdges(el);
			setEdges((prev) =>
				prev.overflows === next.overflows &&
				prev.atStart === next.atStart &&
				prev.atEnd === next.atEnd
					? prev
					: next,
			);
		};
		measure();
		el.addEventListener("scroll", measure, { passive: true });
		const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
		resize?.observe(el);
		const items = new MutationObserver(measure);
		items.observe(el, { childList: true, subtree: true, characterData: true });
		return () => {
			el.removeEventListener("scroll", measure);
			resize?.disconnect();
			items.disconnect();
		};
	}, [stripRef, enabled]);
	return edges;
}
