import { useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
	const mq = window.matchMedia?.(REDUCED_MOTION);
	mq?.addEventListener("change", onChange);
	return () => mq?.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribeReducedMotion,
		() => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
		() => false,
	);
}
