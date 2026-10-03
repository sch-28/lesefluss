import { useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Root class the app sets in e-ink mode, where any motion ghosts whatever the OS setting says. */
export const EINK_CLASS = "eink";

function subscribeReducedMotion(onChange: () => void) {
	const mq = window.matchMedia?.(REDUCED_MOTION);
	mq?.addEventListener("change", onChange);
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
	return () => {
		mq?.removeEventListener("change", onChange);
		observer.disconnect();
	};
}

function isMotionReduced(): boolean {
	return (
		document.documentElement.classList.contains(EINK_CLASS) ||
		(window.matchMedia?.(REDUCED_MOTION).matches ?? false)
	);
}

export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(subscribeReducedMotion, isMotionReduced, () => false);
}
