import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

// The web fallback rejects with `unavailable` where navigator.vibrate is
// missing (iOS Safari, desktop), and haptics are never worth an error.
const ignore = () => {};

// Per-word drag ticks are native only: the web fallback buzzes for 70ms.
const isNative = Capacitor.isNativePlatform();
// selectionChanged is a no-op until selectionStart has created the plugin's generator.
let hasSelectionStarted = false;

export function tick(): void {
	Haptics.impact({ style: ImpactStyle.Light }).catch(ignore);
}

export function dragStep(): void {
	if (!isNative) return;
	if (!hasSelectionStarted) {
		hasSelectionStarted = true;
		Haptics.selectionStart().catch(ignore);
	}
	Haptics.selectionChanged().catch(ignore);
}
