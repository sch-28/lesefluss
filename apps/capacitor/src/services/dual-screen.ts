import { Capacitor, type PluginListenerHandle, registerPlugin } from "@capacitor/core";

import type { ReaderSnapshot } from "./reader-bus";

/**
 * Wire payload sent from primary to secondary on every readerBus change.
 * It is exactly the bus snapshot — no transformation needed.
 */
export type DualScreenSnapshot = ReaderSnapshot;

export type DualScreenCommand =
	| { kind: "togglePlayPause" }
	| { kind: "pause" }
	| { kind: "backWord" }
	| { kind: "forwardWord" }
	| { kind: "backSentence" }
	| { kind: "forwardSentence" }
	| { kind: "changeWpm"; wpm: number }
	| { kind: "openBook"; bookId: string }
	| { kind: "updateSetting"; key: string; value: unknown };

type DualScreenPlugin = {
	getDisplays(): Promise<{
		totalCount: number;
		presentationCount: number;
		summary: string;
	}>;
	enable(options?: { label?: string }): Promise<{ displayId: number; name: string }>;
	disable(): Promise<void>;
	pushState(state: DualScreenSnapshot): Promise<void>;
	addListener(
		event: "command",
		fn: (cmd: DualScreenCommand) => void,
	): Promise<PluginListenerHandle>;
};

export const DualScreen = registerPlugin<DualScreenPlugin>("DualScreen");

/**
 * Probe for a secondary presentation display (e.g. the Ayn Thor's bottom
 * screen) and, if found, dynamically import the dual-screen bridge module
 * to wire it up. The bridge + UI never ship to non-Thor users — it lives in
 * its own lazy chunk that this probe is the sole loader for.
 */
export async function tryEnableDualScreen(): Promise<void> {
	if (Capacitor.getPlatform() !== "android") return;
	try {
		const info = await DualScreen.getDisplays();
		console.log("[Lesefluss] DualScreen displays:", info);
		if (info.presentationCount > 0) {
			const { mountDualScreenBridge } = await import("../dual-screen/mount");
			await mountDualScreenBridge();
		}
	} catch (err) {
		console.warn("[Lesefluss] DualScreen probe failed", err);
	}
}
