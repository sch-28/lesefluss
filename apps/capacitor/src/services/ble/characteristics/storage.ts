/**
 * Storage characteristic - read-only flash storage info.
 * Characteristic 4: R
 *
 * Returns the total and free bytes on the ESP32 flash filesystem.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { SERVICE_UUID, STORAGE_CHAR_UUID } from "@lesefluss/ble-config";
import { bleClient } from "../client";
import type { BLEResult } from "../types";
import { dataViewToString } from "../utils/encoding";

export interface StorageInfo {
	free_bytes: number;
	total_bytes: number;
	book_hash: string; // 8-char hex ID of the book currently on the device, or "" if none
}

/** Read flash storage stats from the device. */
export async function readStorage(): Promise<BLEResult<StorageInfo>> {
	try {
		const device = bleClient.assertConnected();
		const dv = await BleClient.read(device.deviceId, SERVICE_UUID, STORAGE_CHAR_UUID);
		const info = JSON.parse(dataViewToString(dv)) as StorageInfo;
		return { success: true, data: info };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to read storage info",
		};
	}
}
