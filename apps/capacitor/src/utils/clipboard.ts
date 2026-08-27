import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";

export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (Capacitor.isNativePlatform()) {
			await Clipboard.write({ string: text });
			return true;
		}
		if (!navigator.clipboard?.writeText) return false;
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
