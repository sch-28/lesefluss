/**
 * Single-book transfer protocol adapter.
 *
 * Wraps the existing chunked uploader in services/ble/characteristics/transfer.ts
 * so it can be invoked through the new transport adapter. The existing
 * implementation handles START/CHUNK/END framing + CRC32 + base64 encoding.
 */

import { transferBook } from "../../ble/characteristics/transfer";
import type { BLEResult, TransferImpl } from "../../ble-transport/types";

const decoder = new TextDecoder("utf-8");

export const transferSingleBook: TransferImpl = (
	_deviceId,
	content,
	meta,
	onProgress,
): Promise<BLEResult> => {
	const text = decoder.decode(content);
	return transferBook(text, meta.filename, onProgress, meta.title);
};
