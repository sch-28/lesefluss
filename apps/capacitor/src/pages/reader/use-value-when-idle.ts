import { useEffect, useRef, useState } from "react";

const IDLE_RECHECK_MS = 100;

/**
 * `value`, held back while `isBusy()` (a scroll in flight, a turn sliding, a
 * finger dragging) and taken over once the view is idle. For a layout change
 * nobody asked for: re-anchoring under a moving view would stop it and snap
 * it back to where it was.
 */
export function useValueWhenIdle<T>(value: T, isBusy: () => boolean): T {
	const [applied, setApplied] = useState(value);
	const isBusyRef = useRef(isBusy);
	isBusyRef.current = isBusy;
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const apply = () => {
			if (isBusyRef.current()) timer = setTimeout(apply, IDLE_RECHECK_MS);
			else setApplied(value);
		};
		apply();
		return () => clearTimeout(timer);
	}, [value]);
	return applied;
}
