import { useEffect } from "react";
import { log } from "../../utils/log";

/**
 * Holds a screen wake lock while `active` is true so the display does not
 * sleep during long, touch-free sessions (e.g. RSVP playback). The lock is
 * released on deactivate/unmount, and re-acquired on visibilitychange since
 * the browser drops it whenever the page is hidden (app backgrounded, tab
 * switch).
 */
export function useWakeLock(active: boolean, logTag = "wake-lock") {
	useEffect(() => {
		if (!active || !("wakeLock" in navigator)) return;

		let sentinel: WakeLockSentinel | null = null;
		let cancelled = false;

		const acquire = async () => {
			try {
				const lock = await navigator.wakeLock.request("screen");
				if (cancelled) {
					lock.release().catch(() => {});
					return;
				}
				sentinel = lock;
			} catch (err) {
				log.warn(logTag, "wake lock request failed:", err);
			}
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") acquire();
		};

		acquire();
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibilityChange);
			if (sentinel) {
				sentinel.release().catch(() => {});
				sentinel = null;
			}
		};
	}, [active, logTag]);
}
