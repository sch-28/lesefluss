import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The Android back button closes the top overlay instead of navigating the page
 * underneath. The app's hardware back listener asks `consumeBackPress` first.
 *
 * Handlers are consulted newest first. One returning true has consumed the
 * press, and the router leaves history alone.
 */
type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** Register while an overlay is open. Returns the unregister function. */
export function pushBackHandler(handler: BackHandler): () => void {
	handlers.push(handler);
	return () => {
		const at = handlers.lastIndexOf(handler);
		if (at !== -1) handlers.splice(at, 1);
	};
}

/** True when an overlay handled the press and the router should not. */
export function consumeBackPress(): boolean {
	for (let i = handlers.length - 1; i >= 0; i--) {
		if (handlers[i]()) return true;
	}
	return false;
}

/**
 * While `open`, back runs `close`; a non-dismissible overlay (busy saving)
 * swallows the press so the page behind stays put.
 *
 * Only `open` re-registers: re-registering moves the handler to the top of the
 * stack, where it would beat overlays that opened after it.
 */
export function useOverlayBack(open: boolean, close: () => void, dismissible = true): void {
	const latest = useRef({ close, dismissible });
	latest.current = { close, dismissible };

	useEffect(() => {
		if (!open) return;
		return pushBackHandler(() => {
			if (latest.current.dismissible) latest.current.close();
			return true;
		});
	}, [open]);
}

/** Open state for a radix or vaul root that may be controlled or not. */
export function useOverlayOpen(
	open: boolean | undefined,
	defaultOpen: boolean | undefined,
	onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (open: boolean) => void] {
	const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
	const isControlled = open !== undefined;
	const setOpen = useCallback(
		(next: boolean) => {
			if (!isControlled) setUncontrolled(next);
			onOpenChange?.(next);
		},
		[isControlled, onOpenChange],
	);
	return [isControlled ? open : uncontrolled, setOpen];
}
