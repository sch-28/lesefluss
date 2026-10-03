import {
	BUDDY_TRAILER_LAST_TICK,
	BUDDY_TRAILER_TICK_MS,
	type BuddyTrailerReader,
} from "@lesefluss/core";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

/** Avatar colours of the illustrated readers in the buddy-read preview. */
export const BUDDY_TRAILER_READER_TONES: Record<BuddyTrailerReader, string> = {
	Ali: "bg-chart-2 text-background",
	Mia: "bg-muted-foreground text-background",
	Jo: "bg-foreground/75 text-background",
};

const BURST_DOT_COUNT = 8;
const BURST_RADIUS_PX = 24;

/** Offsets of the dots that burst from the note reader when they finish a chapter. */
export const BUDDY_TRAILER_BURST_DOTS = Array.from({ length: BURST_DOT_COUNT }, (_, i) => {
	const angle = (Math.PI * 2 * i) / BURST_DOT_COUNT;
	return { key: i, x: Math.cos(angle) * BURST_RADIUS_PX, y: Math.sin(angle) * BURST_RADIUS_PX };
});

/**
 * The preview's clock: advances while `isActive` (on screen, app in front),
 * stops on the last tick, and jumps straight there under reduced motion.
 */
export function useBuddyTrailerTick(isActive: boolean) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [tick, setTick] = useState(0);
	const isPlaying = !prefersReducedMotion && isActive && tick < BUDDY_TRAILER_LAST_TICK;

	useEffect(() => {
		if (!isPlaying) return;
		const timer = setInterval(
			() => setTick((t) => Math.min(t + 1, BUDDY_TRAILER_LAST_TICK)),
			BUDDY_TRAILER_TICK_MS,
		);
		return () => clearInterval(timer);
	}, [isPlaying]);

	const shownTick = prefersReducedMotion ? BUDDY_TRAILER_LAST_TICK : tick;
	return {
		tick: shownTick,
		prefersReducedMotion,
		canReplay: !prefersReducedMotion && shownTick >= BUDDY_TRAILER_LAST_TICK,
		replay: () => setTick(0),
	};
}
