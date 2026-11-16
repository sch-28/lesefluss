import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** Some browsers deliver the Escape keydown just after the exit it caused. */
const EXIT_ESCAPE_WINDOW_MS = 150;

let lastExitAt = Number.NEGATIVE_INFINITY;

/** Web only: Android immersive fullscreen is LESE-171. */
export function isFullscreenSupported(): boolean {
	return (
		!Capacitor.isNativePlatform() && typeof document !== "undefined" && !!document.fullscreenEnabled
	);
}

/** An Escape that belongs to fullscreen and must not also leave RSVP. */
export function isFullscreenEscape(now = performance.now()): boolean {
	return document.fullscreenElement != null || now - lastExitAt < EXIT_ESCAPE_WINDOW_MS;
}

/**
 * Browser fullscreen for the reader. `onExit` runs on every exit, whoever
 * started it (F, Esc, the browser's own control), since the browser may keep
 * the Escape keydown to itself.
 */
export function useFullscreen({ onExit }: { onExit: () => void }) {
	const [isFullscreen, setIsFullscreen] = useState(
		() => typeof document !== "undefined" && document.fullscreenElement != null,
	);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	useEffect(() => {
		const onChange = () => {
			const isNow = document.fullscreenElement != null;
			if (!isNow) {
				lastExitAt = performance.now();
				onExitRef.current();
			}
			setIsFullscreen(isNow);
		};
		document.addEventListener("fullscreenchange", onChange);
		return () => {
			document.removeEventListener("fullscreenchange", onChange);
			// Leaving the reader leaves fullscreen: the rest of the app has no way out of it.
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		};
	}, []);

	const toggle = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		else void document.documentElement.requestFullscreen().catch(() => {});
	}, []);

	const exit = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
	}, []);

	return { isFullscreen, toggle, exit };
}

const HIDE_DELAY_MS = 1500;

/**
 * Mockup B: the bar slides in while the pointer is at the top edge or on the
 * bar, and leaves 1.5 s after the pointer does, unless a menu it opened is up.
 */
export function useRevealOnHover(isActive: boolean, hasOpenMenu: () => boolean) {
	const [isRevealed, setIsRevealed] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clear = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	const reveal = useCallback(() => {
		clear();
		setIsRevealed(true);
	}, [clear]);

	const hideSoon = useCallback(() => {
		clear();
		const tryHide = () => {
			if (hasOpenMenu()) timerRef.current = setTimeout(tryHide, HIDE_DELAY_MS);
			else setIsRevealed(false);
		};
		timerRef.current = setTimeout(tryHide, HIDE_DELAY_MS);
	}, [clear, hasOpenMenu]);

	useEffect(() => {
		if (!isActive) {
			clear();
			setIsRevealed(false);
		}
	}, [isActive, clear]);

	useEffect(() => clear, [clear]);

	return { isRevealed: isActive && isRevealed, reveal, hideSoon };
}
