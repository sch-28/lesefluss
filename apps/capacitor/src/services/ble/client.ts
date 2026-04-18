/**
 * BLE Client - scan, connect, disconnect, connection state.
 * All characteristic I/O lives in src/ble/characteristics/.
 */

import { BleClient, type BleDevice, type ScanResult } from "@capacitor-community/bluetooth-le";
import { DEVICE_NAME } from "@lesefluss/ble-config";
import { log } from "../../utils/log";
import { BLE_CONNECTION_TIMEOUT_MS, BLEConnectionState, type BLEResult } from "./types";

export interface ScannedDevice {
	device: BleDevice;
	rssi: number;
	name: string;
}

class BLEClient {
	private _connectionState: BLEConnectionState = BLEConnectionState.DISCONNECTED;
	private _connectedDevice: BleDevice | null = null;
	private _scannedDevices = new Map<string, ScannedDevice>();
	private _scanCallback: ((devices: ScannedDevice[]) => void) | null = null;

	// ------------------------------------------------------------------
	// Init
	// ------------------------------------------------------------------

	async initialize(): Promise<BLEResult> {
		try {
			await BleClient.initialize();
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to initialize BLE",
			};
		}
	}

	// ------------------------------------------------------------------
	// Scanning
	// ------------------------------------------------------------------

	async startScan(onDevicesFound: (devices: ScannedDevice[]) => void): Promise<BLEResult> {
		try {
			this._scannedDevices.clear();
			this._scanCallback = onDevicesFound;

			await BleClient.requestLEScan({ namePrefix: DEVICE_NAME }, (result: ScanResult) => {
				const device: ScannedDevice = {
					device: result.device,
					rssi: result.rssi ?? -100,
					name: result.localName || result.device.name || "Unknown",
				};
				this._scannedDevices.set(result.device.deviceId, device);
				this._scanCallback?.(Array.from(this._scannedDevices.values()));
			});

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to start scan",
			};
		}
	}

	async stopScan(): Promise<BLEResult> {
		try {
			await BleClient.stopLEScan();
			this._scanCallback = null;
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to stop scan",
			};
		}
	}

	// ------------------------------------------------------------------
	// Connection
	// ------------------------------------------------------------------

	async connect(deviceId: string): Promise<BLEResult<BleDevice>> {
		if (this._connectionState !== BLEConnectionState.DISCONNECTED) {
			return { success: false, error: "Already connected or connecting" };
		}

		try {
			this._connectionState = BLEConnectionState.CONNECTING;
			await this.stopScan();

			let rejectOnDisconnect: (reason: Error) => void;
			const disconnectGuard = new Promise<never>((_, reject) => {
				rejectOnDisconnect = reject;
			});

			await Promise.race([
				BleClient.connect(
					deviceId,
					() => {
						// This callback fires both during connect (race guard)
						// and after a successful connection drops (e.g. deep sleep).
						if (this._connectionState === BLEConnectionState.CONNECTING) {
							log("ble", "disconnect callback fired during connect");
							rejectOnDisconnect(new Error("Disconnected during connect"));
						} else {
							log("ble", "device disconnected (link loss)");
							this._onDisconnect();
						}
					},
					{ timeout: BLE_CONNECTION_TIMEOUT_MS },
				),
				disconnectGuard,
			]);

			const deviceInfo = this._scannedDevices.get(deviceId);
			this._connectedDevice = deviceInfo?.device ?? { deviceId };
			this._connectionState = BLEConnectionState.CONNECTED;

			log("ble", "connected:", deviceId);
			return { success: true, data: this._connectedDevice };
		} catch (error) {
			try {
				await BleClient.disconnect(deviceId);
			} catch {
				// Ignore - device may already be disconnected
			}
			this._connectionState = BLEConnectionState.DISCONNECTED;
			this._connectedDevice = null;
			const msg = error instanceof Error ? error.message : "Connection failed";
			log("ble", "connect failed:", msg);
			return { success: false, error: msg };
		}
	}

	async disconnect(): Promise<BLEResult> {
		if (!this._connectedDevice) return { success: true };

		try {
			this._connectionState = BLEConnectionState.DISCONNECTING;
			await BleClient.disconnect(this._connectedDevice.deviceId);
			this._onDisconnect();
			return { success: true };
		} catch (error) {
			this._onDisconnect();
			return {
				success: false,
				error: error instanceof Error ? error.message : "Disconnect failed",
			};
		}
	}

	private _onDisconnect(): void {
		log("ble", "disconnected");
		this._connectedDevice = null;
		this._connectionState = BLEConnectionState.DISCONNECTED;
	}

	// ------------------------------------------------------------------
	// Accessors
	// ------------------------------------------------------------------

	get connectionState(): BLEConnectionState {
		return this._connectionState;
	}

	get connectedDevice(): BleDevice | null {
		return this._connectedDevice;
	}

	get isConnected(): boolean {
		return this._connectionState === BLEConnectionState.CONNECTED && this._connectedDevice !== null;
	}

	/** Throw if not connected - used by characteristic helpers. */
	assertConnected(): BleDevice {
		if (!this._connectedDevice || !this.isConnected) {
			throw new Error("Not connected to a device");
		}
		return this._connectedDevice;
	}
}

export const bleClient = new BLEClient();
