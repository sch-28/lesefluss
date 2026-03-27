/**
 * BLE Configuration for RSVP Reader ESP32 Device
 *
 * UUIDs generated for custom RSVP Reader service and characteristics.
 * Using standard Bluetooth SIG format for compatibility.
 */

export const BLE_CONFIG = {
	// Device name to scan for
	DEVICE_NAME: "RSVP-Reader",

	// Custom service UUID for RSVP Reader
	SERVICE_UUID: "ad1863bc-9b9d-4098-a7ce-3ba1d2aabaf9",

	// Settings characteristic UUID (read/write JSON blob)
	SETTINGS_CHARACTERISTIC_UUID: "db0d0b25-5282-4e5f-9b5d-30f65c652f2f",

	// Connection timeout in milliseconds
	CONNECTION_TIMEOUT: 30000,

	// Read/write timeout in milliseconds
	OPERATION_TIMEOUT: 10000,

	// Maximum retries for failed operations
	MAX_RETRIES: 3,
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
