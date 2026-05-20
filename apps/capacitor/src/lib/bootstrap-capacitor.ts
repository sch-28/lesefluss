import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";

export async function bootstrapCapacitor() {
	if (!Capacitor.isNativePlatform()) return;
	// Best-effort: older native shells may not implement these plugin methods.
	try {
		await StatusBar.setStyle({ style: Style.Default });
		await StatusBar.setOverlaysWebView({ overlay: true });
	} catch (err) {
		console.warn("[bootstrap] status bar setup failed", err);
	}
	try {
		await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
	} catch (err) {
		console.warn("[bootstrap] keyboard setup failed", err);
	}
}
