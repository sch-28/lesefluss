const LOOP_MESSAGE = "ResizeObserver loop completed with undelivered notifications.";

/**
 * virtua's flushSync re-renders leave this harmless error on every list load.
 * Wraps window.onerror, not a listener: Chrome runs window listeners in registration
 * order, and Capacitor's logger is the onerror its native bridge set first.
 */
export function silenceResizeObserverLoop(target: Window = window): void {
	const logger = target.onerror;
	target.onerror = (message, ...rest) => {
		if (message === LOOP_MESSAGE) return true;
		return logger ? logger.call(target, message, ...rest) : false;
	};
}
