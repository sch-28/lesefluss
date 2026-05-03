import { DualScreen } from "../services/dual-screen";
import { startBridge } from "./bridge";

let unmount: (() => void) | null = null;

/**
 * Enable the native Presentation on Screen-2 and start forwarding readerBus
 * snapshots into it. Idempotent — safe to call multiple times.
 */
export async function mountDualScreenBridge(): Promise<void> {
	if (unmount) return;
	const res = await DualScreen.enable({ label: "Lesefluss · Screen 2" });
	console.log("[Lesefluss] DualScreen mounted on", res);
	unmount = startBridge();
}

export async function unmountDualScreenBridge(): Promise<void> {
	if (unmount) {
		unmount();
		unmount = null;
	}
	await DualScreen.disable().catch(() => {});
}
