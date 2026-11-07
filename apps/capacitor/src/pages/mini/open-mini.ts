import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import { isPipSupported, openPipWindow } from "../../services/pip/open-pip-window";
import {
	createChannelPort,
	createMemoryLink,
	type FromMini,
	type MainPort,
	type MiniPort,
	type ToMini,
} from "./mini-bridge";

/** What a tiling window manager's rule matches the window on. */
export const MINI_WINDOW_TITLE = "Lesefluss mini RSVP";
const PIP_SIZE = { width: 380, height: 150 };
const POPUP_FEATURES = "popup,width=600,height=150";
const POPUP_NAME = "lesefluss-mini";

type Env = { isNative: boolean; isMobile: boolean; hasPip: boolean; hasChannel: boolean };

export function isMiniAvailableIn({ isNative, isMobile, hasPip, hasChannel }: Env): boolean {
	return !isNative && !isMobile && (hasPip || hasChannel);
}

type MobileHints = {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
	uaDataMobile?: boolean;
	isPrimaryPointerCoarse: boolean;
};

/** Phones and tablets, where a popup opens as a full tab. */
export function isMobileBrowser({
	userAgent,
	platform,
	maxTouchPoints,
	uaDataMobile,
	isPrimaryPointerCoarse,
}: MobileHints): boolean {
	// Tablets that request the desktop site send a desktop user agent; a touchscreen laptop's primary pointer is still fine.
	if (uaDataMobile || isPrimaryPointerCoarse) return true;
	if (/Android|iPhone|iPad|iPod|Mobi/i.test(userAgent)) return true;
	// iPadOS Safari reports itself as a Mac.
	return platform === "MacIntel" && maxTouchPoints > 1;
}

function isMobileNavigator(): boolean {
	if (typeof navigator === "undefined") return false;
	const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
	return isMobileBrowser({
		userAgent: nav.userAgent,
		platform: nav.platform,
		maxTouchPoints: nav.maxTouchPoints ?? 0,
		uaDataMobile: nav.userAgentData?.mobile,
		isPrimaryPointerCoarse:
			typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
	});
}

/** Desktop web only, with either an always-on-top pop-up or a popup window fed over a channel. */
export function isMiniAvailable(): boolean {
	return isMiniAvailableIn({
		isNative: Capacitor.isNativePlatform(),
		isMobile: isMobileNavigator(),
		hasPip: isPipSupported(),
		hasChannel: typeof BroadcastChannel !== "undefined",
	});
}

type SessionBase = {
	id: string;
	bookId: string;
	window: Window;
	main: MainPort;
	/** The reader left the book: the window shows where it stopped and follows nothing. */
	isStopped: boolean;
};

export type MiniSession =
	| (SessionBase & { host: "pip"; mini: MiniPort })
	| (SessionBase & { host: "popup" });

let session: MiniSession | null = null;
const listeners = new Set<() => void>();

function setSession(next: MiniSession | null) {
	const previous = session;
	session = next;
	if (previous && previous.id !== next?.id) {
		previous.main.close();
		if (previous.host === "pip") previous.mini.close();
	}
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useMiniSession(): MiniSession | null {
	return useSyncExternalStore(subscribe, () => session);
}

export function currentMiniSession(): MiniSession | null {
	return session;
}

export function markMiniStopped(id: string): void {
	if (session?.id === id && !session.isStopped) setSession({ ...session, isStopped: true });
}

function newSessionId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function miniPopupUrl(base: string, sessionId: string): string {
	return `${base.replace(/\/?$/, "/")}mini?s=${encodeURIComponent(sessionId)}`;
}

/**
 * Opens the mini window on `bookId`. Call it from a click or key press: both
 * windows need one. Resolves false when the browser refused to open any.
 */
export async function openMini(bookId: string): Promise<boolean> {
	closeMini();
	const id = newSessionId();
	if (isPipSupported()) {
		try {
			const win = await openPipWindow({ ...PIP_SIZE, title: MINI_WINDOW_TITLE });
			const { main, mini } = createMemoryLink();
			win.addEventListener(
				"pagehide",
				() => {
					if (session?.id === id) setSession(null);
				},
				{ once: true },
			);
			setSession({ id, bookId, host: "pip", window: win, main, mini, isStopped: false });
			return true;
		} catch {
			// The activation was used up or the pop-up refused: the popup window may still open.
		}
	}
	if (typeof BroadcastChannel === "undefined") return false;
	const win = window.open(miniPopupUrl(import.meta.env.BASE_URL, id), POPUP_NAME, POPUP_FEATURES);
	if (!win) return false;
	const main: MainPort = createChannelPort<FromMini, ToMini>(id, "main");
	setSession({ id, bookId, host: "popup", window: win, main, isStopped: false });
	return true;
}

export function closeMini(): void {
	const current = session;
	if (!current) return;
	if (current.host === "pip") {
		// Its pagehide clears the session; the reader then saves the last word shown.
		current.window.close();
		return;
	}
	current.window.close();
	setSession(null);
}

/** The popup said it closed: it is already gone. */
export function endMiniSession(id: string): void {
	if (session?.id === id) setSession(null);
}
