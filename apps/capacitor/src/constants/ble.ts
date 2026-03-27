/**
 * BLE Configuration for RSVP Reader ESP32 Device
 *
 * UUIDs and protocol constants are sourced from @rsvp/ble-config (single source
 * of truth). The same values are used by the ESP32 via apps/esp32/src/ble_config.py
 * (auto-generated — run `pnpm setup:project` from the repo root to regenerate).
 */

import {
	DEVICE_NAME,
	SERVICE_UUID,
	SETTINGS_CHAR_UUID,
	SLOT_INFO_CHAR_UUID,
	FILE_TRANSFER_CHAR_UUID,
	MAX_RETRIES,
} from '@rsvp/ble-config';

export const BLE_CONFIG = {
	DEVICE_NAME,
	SERVICE_UUID,
	SETTINGS_CHARACTERISTIC_UUID: SETTINGS_CHAR_UUID,
	SLOT_INFO_CHARACTERISTIC_UUID: SLOT_INFO_CHAR_UUID,
	FILE_TRANSFER_CHARACTERISTIC_UUID: FILE_TRANSFER_CHAR_UUID,

	// Connection timeout in milliseconds
	CONNECTION_TIMEOUT: 30000,

	// Read/write timeout in milliseconds
	OPERATION_TIMEOUT: 10000,

	// Maximum retries for failed operations
	MAX_RETRIES,
} as const;

/**
 * BLE connection states
 */
export enum BLEConnectionState {
	DISCONNECTED = "disconnected",
	CONNECTING = "connecting",
	CONNECTED = "connected",
	DISCONNECTING = "disconnecting",
}

/**
 * BLE operation result
 */
export interface BLEResult<T = void> {
	success: boolean;
	data?: T;
	error?: string;
}
