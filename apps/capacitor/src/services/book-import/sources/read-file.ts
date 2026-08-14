import { Capacitor } from "@capacitor/core";

/**
 * Upper bound on importable file size. `readData`-style whole-file base64
 * marshalling used to OOM the native bridge well before this; reading bytes
 * straight into the WebView raises the ceiling, but a truly huge file can still
 * exhaust the renderer heap, so reject it up front with a toast instead.
 */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

const READ_TIMEOUT_MS = 60_000;

/**
 * Read a native file URI (picker `content://`, SAF document URI, or a plain
 * path) into the WebView.
 *
 * `readData: true` would base64-encode the whole file into a single Java String
 * on the bridge, OOMing the ART heap for large files (the native OOM is
 * swallowed and the import hangs forever). `convertFileSrc` exposes the URI to
 * `fetch` instead.
 *
 * Throws `Error("FILE_READ_FAILED")` if the bytes can't be read.
 */
export async function readNativeFile(uri: string): Promise<ArrayBuffer> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
	try {
		const res = await fetch(Capacitor.convertFileSrc(uri), { signal: controller.signal });
		if (!res.ok) throw new Error("FILE_READ_FAILED");
		return await res.arrayBuffer();
	} catch {
		throw new Error("FILE_READ_FAILED");
	} finally {
		clearTimeout(timer);
	}
}

/** Read a web `File` into an ArrayBuffer. Throws `Error("FILE_READ_FAILED")`. */
export function readWebFile(file: File): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
		reader.readAsArrayBuffer(file);
	});
}
