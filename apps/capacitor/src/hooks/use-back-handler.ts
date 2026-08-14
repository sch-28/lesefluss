import { useEffect, useRef } from "react";
import { pushBackHandler } from "../services/overlay-back";

/**
 * Consume the Android back press while `active`, running `handler` instead of
 * letting the router navigate.
 *
 * Handlers run newest-first, so registration order decides who wins: register
 * the outer state before the overlay that sits on top of it.
 *
 * `handler` is held in a ref and deliberately kept out of the dependencies, so
 * an inline arrow at the call site is safe. Re-registering would push the
 * handler back to the top of the stack, where it would start beating overlays
 * that opened later — so only `active` may re-register it.
 */
export function useBackHandler(active: boolean, handler: () => void): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		if (!active) return;
		return pushBackHandler(() => {
			handlerRef.current();
			return true;
		});
	}, [active]);
}
