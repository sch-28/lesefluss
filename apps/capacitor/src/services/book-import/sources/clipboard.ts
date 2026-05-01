import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";
import type { RawInput } from "@lesefluss/book-import";

/**
 * Read the current clipboard contents as a `RawInput` of kind "text".
 *
 * Throws `Error("EMPTY")` if the clipboard has no usable text — callers
 * surface this as a toast rather than a generic import error.
 */
export async function readClipboardToRawInput(): Promise<RawInput> {
	const text = await readClipboardText();
	if (!text.trim()) throw new Error("EMPTY");
	return { kind: "text", text };
}

async function readClipboardText(): Promise<string> {
	if (Capacitor.isNativePlatform()) {
		const { value, type } = await Clipboard.read();
		if (!value || !type.startsWith("text/")) return "";
		return value;
	}
	if (!navigator.clipboard?.readText) return "";
	try {
		return await navigator.clipboard.readText();
	} catch {
		return "";
	}
}
