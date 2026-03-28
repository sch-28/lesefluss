export enum BLEConnectionState {
	DISCONNECTED = "disconnected",
	CONNECTING = "connecting",
	CONNECTED = "connected",
	DISCONNECTING = "disconnecting",
}

export interface BLEResult<T = void> {
	success: boolean;
	data?: T;
	error?: string;
}

export const BLE_CONNECTION_TIMEOUT_MS = 30_000;
