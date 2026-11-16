import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

export async function bootstrapCapacitor() {
	// setResizeMode is iOS-only; Android rejects it with "not implemented".
	if (Capacitor.getPlatform() !== "ios") return;
	try {
		await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
	} catch (err) {
		console.warn("[bootstrap] keyboard setup failed", err);
	}
}
