import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReadingRuler } from "./reading-ruler";

/**
 * Owns the reader's `ReadingRuler` and keeps it aligned: on scroll (a passive
 * capture listener, since scroll events don't bubble to the view), on resize, on
 * a font load and on any layout setting change. Each re-measure reads rects and
 * writes the ruler's own nodes only, nothing the virtual list measures.
 */
export function useReadingRuler({
	view,
	isOn,
	lines,
	isPaged,
	layoutKey,
}: {
	view: HTMLElement | null;
	isOn: boolean;
	lines: number;
	/** Page mode: PageView reports motion and its column grid. */
	isPaged: boolean;
	/** Changes whenever text may have reflowed (layout settings). */
	layoutKey: unknown;
}) {
	const [ruler] = useState(() => new ReadingRuler());
	const frameRef = useRef(0);
	const motionSeqRef = useRef(0);

	const scheduleRelayout = useCallback(() => {
		if (frameRef.current) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = 0;
			ruler.relayout();
		});
	}, [ruler]);

	useLayoutEffect(() => ruler.setLines(lines), [ruler, lines]);

	// Leaving page mode mid-turn must not leave the ruler waiting for a landing
	// that will never be reported, or holding a spread's column grid.
	useLayoutEffect(() => {
		if (isPaged) return;
		motionSeqRef.current++;
		ruler.setColumns(null);
		ruler.setMoving(false);
	}, [ruler, isPaged]);

	useEffect(() => {
		if (!view || !isOn) return;
		view.addEventListener("scroll", scheduleRelayout, { capture: true, passive: true });
		const observer = new ResizeObserver(scheduleRelayout);
		observer.observe(view);
		document.fonts?.addEventListener("loadingdone", scheduleRelayout);
		return () => {
			view.removeEventListener("scroll", scheduleRelayout, { capture: true });
			observer.disconnect();
			document.fonts?.removeEventListener("loadingdone", scheduleRelayout);
			cancelAnimationFrame(frameRef.current);
			frameRef.current = 0;
		};
	}, [view, isOn, scheduleRelayout]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey is a re-run trigger
	useEffect(() => {
		if (isOn) scheduleRelayout();
	}, [isOn, layoutKey, scheduleRelayout]);

	// The landing that ends motion commits its page in a later layout effect; a
	// frame later the rects are the landed page's. A newer report cancels it.
	const onMotion = useCallback(
		(moving: boolean) => {
			const seq = ++motionSeqRef.current;
			if (moving) {
				ruler.setMoving(true);
				return;
			}
			requestAnimationFrame(() => {
				if (seq === motionSeqRef.current) ruler.setMoving(false);
			});
		},
		[ruler],
	);

	const onColumns = useCallback(
		(columns: { stride: number; width: number }) => ruler.setColumns(columns),
		[ruler],
	);

	return { ruler, onMotion, onColumns };
}
