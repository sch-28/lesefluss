import type { RawInput } from "../types";

/**
 * Wrap an in-memory Blob (e.g. a catalog download) into a `RawInput`.
 */
export async function blobToRawInput(blob: Blob, fileName: string): Promise<RawInput> {
	return {
		kind: "bytes",
		bytes: await blob.arrayBuffer(),
		fileName,
		mimeType: blob.type || undefined,
	};
}
