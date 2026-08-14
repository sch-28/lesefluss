/**
 * Overlays that live outside the router (drawers mounted at the root) need the
 * Android back button to close them rather than navigate the page underneath.
 *
 * Handlers are consulted newest first. One returning true has consumed the
 * press, and `HardwareBack` leaves history alone.
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
