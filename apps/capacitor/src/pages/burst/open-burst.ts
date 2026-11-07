import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import { isPipSupported, openPipWindow } from "../../services/pip/open-pip-window";

/** What a tiling window manager's rule matches the pop-up on; the help page names it. */
export const BURST_WINDOW_TITLE = "Lesefluss burst read";
const BURST_SIZE = { width: 600, height: 120 };

/** A desktop feature: the web build only, where a pop-up or a floating strip makes sense. */
export function isBurstAvailable(): boolean {
	return !Capacitor.isNativePlatform();
}

export type BurstSession =
	| { id: number; host: "pip"; window: Window; bookId: string | null }
	| { id: number; host: "tab"; bookId: string | null };

let session: BurstSession | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function setSession(next: BurstSession | null) {
	session = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useBurstSession(): BurstSession | null {
	return useSyncExternalStore(subscribe, () => session);
}

/**
 * Opens the burst strip on `bookId`, or on the book read last. Call it from a
 * click or key press: the pop-up needs one. Opening again restarts the strip,
 * which saves the open one on its way out.
 */
export async function openBurst(bookId: string | null = null): Promise<void> {
	if (isPipSupported()) {
		try {
			const win = await openPipWindow({ ...BURST_SIZE, title: BURST_WINDOW_TITLE });
			win.addEventListener(
				"pagehide",
				() => {
					if (session?.host === "pip" && session.window === win) setSession(null);
				},
				{ once: true },
			);
			setSession({ id: nextId++, host: "pip", window: win, bookId });
			return;
		} catch {
			// No activation left, or the pop-up was refused: the strip floats in the tab.
		}
	}
	setSession({ id: nextId++, host: "tab", bookId });
}

export function closeBurst(): void {
	const current = session;
	if (!current) return;
	// The pop-up's pagehide clears the session, after the strip has saved.
	if (current.host === "pip") current.window.close();
	else setSession(null);
}
