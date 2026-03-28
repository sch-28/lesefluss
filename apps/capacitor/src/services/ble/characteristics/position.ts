/**
 * Position characteristic — bidirectional byte-offset sync.
 * Characteristic 3: R/W
 *
 * Device is authoritative on connect (may have been reading without the phone).
 * App writes position when the in-app reader advances.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { POSITION_CHAR_UUID, SERVICE_UUID } from "@rsvp/ble-config";
import { bleClient } from "../client";
import type { BLEResult } from "../types";
import { dataViewToString, stringToDataView } from "../utils/encoding";

/** Read the device's current byte offset. */
export async function readPosition(): Promise<BLEResult<number>> {
	try {
		const device = bleClient.assertConnected();
		const dv = await BleClient.read(device.deviceId, SERVICE_UUID, POSITION_CHAR_UUID);
		const { position } = JSON.parse(dataViewToString(dv)) as { position: number };
		return { success: true, data: position };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to read position",
		};
	}
}

/** Push a byte offset to the device (used by the in-app reader). */
export async function writePosition(position: number): Promise<BLEResult> {
	try {
		const device = bleClient.assertConnected();
		await BleClient.write(
			device.deviceId,
			SERVICE_UUID,
			POSITION_CHAR_UUID,
			stringToDataView(JSON.stringify({ position })),
		);
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to write position",
		};
	}
}
