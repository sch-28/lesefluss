/**
 * BLE Client - scan, connect, disconnect, connection state.
 * All characteristic I/O lives in src/ble/characteristics/.
 */

import { BleClient, type BleDevice, type ScanResult } from "@capacitor-community/bluetooth-le";
import { log } from "../../utils/log";
import { DEVICE_DESCRIPTORS } from "../devices";
import { BLE_CONNECTION_TIMEOUT_MS, BLEConnectionState, type BLEResult } from "./types";

export interface ScannedDevice {
	device: BleDevice;
	rssi: number;
	name: string;
	descriptorId: string;
}

class BLEClient {
	private _connectionState: BLEConnectionState = BLEConnectionState.DISCONNECTED;
	private _connectedDevice: BleDevice | null = null;
	private _connectedDescriptorId: string | null = null;
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

			// Match each scan result against the descriptor registry. We accept
			// either advertised service UUID (multi-book device firmware does this)
			// or device-name prefix (legacy esp32 firmware only advertises name).
			const byServiceUuid = new Map(
				DEVICE_DESCRIPTORS.map((d) => [d.serviceUuid.toLowerCase(), d]),
			);

			await BleClient.requestLEScan({}, (result: ScanResult) => {
				const advertisedUuids = (result.uuids ?? []).map((u) => u.toLowerCase());
				const advertisedName = result.localName || result.device.name || "";

				let matched = advertisedUuids.map((u) => byServiceUuid.get(u)).find((d) => d !== undefined);
				const matchedByUuid = matched !== undefined;
				if (!matched) {
					matched = DEVICE_DESCRIPTORS.find((d) => advertisedName.startsWith(d.deviceName));
				}
				if (!matched) {
					return;
				}
				// A device can emit multiple advertisement frames per scan: a
				// UUID-bearing one and a name-only one. The UUID match is
				// authoritative; never let a later name-only frame overwrite
				// it (otherwise a multi-book device whose name happens to
				// prefix-match the single-book descriptor would silently get
				// re-tagged as single-book between connect attempts).
				const existing = this._scannedDevices.get(result.device.deviceId);
				if (existing && !matchedByUuid && existing.descriptorId !== matched.id) {
					return;
				}
				const device: ScannedDevice = {
					device: result.device,
					rssi: result.rssi ?? -100,
					name: advertisedName || matched.deviceName,
					descriptorId: matched.id,
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
			if (!deviceInfo) {
				// No scan record → we'd be guessing the descriptor. Force a
				// re-scan by failing the connect; silently defaulting to
				// SINGLE_BOOK_DESCRIPTOR_ID misroutes rsvpnano sessions through
				// the ESP32 char set and shows the wrong settings UI.
				await BleClient.disconnect(deviceId).catch(() => {});
				this._connectionState = BLEConnectionState.DISCONNECTED;
				return { success: false, error: "Device not in current scan results" };
			}
			this._connectedDevice = deviceInfo.device;
			this._connectedDescriptorId = deviceInfo.descriptorId;
			this._connectionState = BLEConnectionState.CONNECTED;

			log("ble", "connected:", deviceId, "as", this._connectedDescriptorId);
			return { success: true, data: this._connectedDevice };
		} catch (error) {
			try {
				await BleClient.disconnect(deviceId);
			} catch {
				// Ignore - device may already be disconnected
			}
			this._connectionState = BLEConnectionState.DISCONNECTED;
			this._connectedDevice = null;
			this._connectedDescriptorId = null;
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
		this._connectedDescriptorId = null;
		this._connectionState = BLEConnectionState.DISCONNECTED;
	}

	get connectedDescriptorId(): string | null {
		return this._connectedDescriptorId;
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
