import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
	useEffect(() => {
		const mq = window.matchMedia?.(query);
		if (!mq) return;
		setMatches(mq.matches);
		const onChange = () => setMatches(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [query]);
	return matches;
}

export const FINE_POINTER_QUERY = "(pointer: fine)";
export const DESKTOP_OVERLAY_QUERY = "(min-width: 768px) and (pointer: fine)";

/**
 * Whether overlays open as desktop dialogs and anchored menus: a wide screen
 * with a mouse, on web and native alike. A touch tablet keeps the sheets.
 */
export function useDesktopOverlay(): boolean {
	return useMediaQuery(DESKTOP_OVERLAY_QUERY);
}
