import { type RefObject, useEffect, useRef } from "react";

type Options = {
	host: "pip" | "tab";
	/** The pop-up's window, or the tab's own. */
	win: Window;
	/** The strip in the tab: a press outside it is the user looking away. */
	rootRef: RefObject<HTMLElement | null>;
	onWake: () => void;
	onHide: () => void;
};

/**
 * When the user looks at the strip and away from it. Window blur is the hide
 * signal that always fires: a window parked in a Hyprland special workspace
 * still reports itself visible.
 */
export function useBurstFocus({ host, win, rootRef, onWake, onHide }: Options): void {
	const wakeRef = useRef(onWake);
	wakeRef.current = onWake;
	const hideRef = useRef(onHide);
	hideRef.current = onHide;

	useEffect(() => {
		const wake = () => wakeRef.current();
		const hide = () => hideRef.current();
		const onVisibility = () => {
			if (win.document.hidden) hide();
		};
		const onPointerDown = (e: PointerEvent) => {
			const root = rootRef.current;
			if (root && e.target instanceof Node && !root.contains(e.target)) hide();
		};

		win.addEventListener("blur", hide);
		win.addEventListener("pagehide", hide);
		win.document.addEventListener("visibilitychange", onVisibility);
		if (host === "pip") win.addEventListener("focus", wake);
		else win.document.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			win.removeEventListener("blur", hide);
			win.removeEventListener("pagehide", hide);
			win.document.removeEventListener("visibilitychange", onVisibility);
			win.removeEventListener("focus", wake);
			win.document.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [host, win, rootRef]);
}
