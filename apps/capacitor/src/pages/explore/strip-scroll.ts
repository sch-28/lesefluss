import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { type RefObject, useSyncExternalStore } from "react";

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
