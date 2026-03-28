/** Convert a BLE DataView to a UTF-8 string, stripping trailing null bytes. */
export function dataViewToString(dv: DataView): string {
	return new TextDecoder("utf-8").decode(dv).replace(/\0+$/, "");
}

/** Encode a UTF-8 string into a DataView for BLE writes. */
export function stringToDataView(str: string): DataView {
	return new DataView(new TextEncoder().encode(str).buffer);
}

/**
 * Split a Uint8Array into fixed-size byte chunks.
 * Used to break UTF-8 encoded book content into BLE transfer frames.
 * Slicing by bytes (not characters) ensures chunk sizes are predictable
 * and avoids btoa() failures on multi-byte characters.
 */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
	const chunks: Uint8Array[] = [];
	for (let i = 0; i < bytes.length; i += size) {
		chunks.push(bytes.subarray(i, i + size));
	}
	return chunks;
}

/**
 * Base64-encode a Uint8Array without using btoa() on a string.
 * btoa() only handles Latin-1 (0–255 as character codes), which fails
 * when called on raw string slices containing multi-byte characters.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
