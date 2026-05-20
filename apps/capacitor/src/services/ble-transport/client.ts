/**
 * Descriptor-aware BLE client. Scans for any device whose advertised
 * service UUID matches one of the registered descriptors and tags each
 * scan result with the matching descriptorId so the UI can branch on
 * device kind before connecting.
 */

import { BleClient, type BleDevice, type ScanResult } from "@capacitor-community/bluetooth-le";
import { log } from "../../utils/log";
import type { DeviceDescriptor } from "./types";
import { BLEConnectionState, type BLEResult, type ScannedDevice } from "./types";

const CONNECTION_TIMEOUT_MS = 5_000;

class TransportBleClient {
	private connectionState_: BLEConnectionState = BLEConnectionState.DISCONNECTED;
	private connectedDevice_: BleDevice | null = null;
	private connectedDescriptorId_: string | null = null;
	private scannedDevices_ = new Map<string, ScannedDevice>();
	private scanCallback_: ((devices: ScannedDevice[]) => void) | null = null;

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

	async startScan(
		descriptors: DeviceDescriptor[],
		onDevicesFound: (devices: ScannedDevice[]) => void,
	): Promise<BLEResult> {
		try {
			this.scannedDevices_.clear();
			this.scanCallback_ = onDevicesFound;

			const serviceUuids = descriptors.map((d) => d.serviceUuid);
			const byServiceUuid = new Map(descriptors.map((d) => [d.serviceUuid.toLowerCase(), d]));

			await BleClient.requestLEScan({ services: serviceUuids }, (result: ScanResult) => {
				const advertisedUuids = (result.uuids ?? []).map((u) => u.toLowerCase());
				const matched = advertisedUuids
					.map((u) => byServiceUuid.get(u))
					.find((d): d is DeviceDescriptor => d !== undefined);
				if (!matched) {
					return;
				}
				const device: ScannedDevice = {
					device: result.device,
					rssi: result.rssi ?? -100,
					name: result.localName || result.device.name || matched.deviceName,
					descriptorId: matched.id,
				};
				this.scannedDevices_.set(result.device.deviceId, device);
				this.scanCallback_?.(Array.from(this.scannedDevices_.values()));
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
			this.scanCallback_ = null;
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to stop scan",
			};
		}
	}

	async connect(deviceId: string, descriptorId: string): Promise<BLEResult<BleDevice>> {
		if (this.connectionState_ !== BLEConnectionState.DISCONNECTED) {
			return { success: false, error: "Already connected or connecting" };
		}

		try {
			this.connectionState_ = BLEConnectionState.CONNECTING;
			await this.stopScan();

			let rejectOnDisconnect: (reason: Error) => void = () => {};
			const disconnectGuard = new Promise<never>((_, reject) => {
				rejectOnDisconnect = reject;
			});

			await Promise.race([
				BleClient.connect(
					deviceId,
					() => {
						if (this.connectionState_ === BLEConnectionState.CONNECTING) {
							log("ble-transport", "disconnect during connect");
							rejectOnDisconnect(new Error("Disconnected during connect"));
						} else {
							log("ble-transport", "link loss");
							this.onDisconnect_();
						}
					},
					{ timeout: CONNECTION_TIMEOUT_MS },
				),
				disconnectGuard,
			]);

			const info = this.scannedDevices_.get(deviceId);
			this.connectedDevice_ = info?.device ?? { deviceId };
			this.connectedDescriptorId_ = descriptorId;
			this.connectionState_ = BLEConnectionState.CONNECTED;
			log("ble-transport", "connected", deviceId, "as", descriptorId);
			return { success: true, data: this.connectedDevice_ };
		} catch (error) {
			try {
				await BleClient.disconnect(deviceId);
			} catch {}
			this.connectionState_ = BLEConnectionState.DISCONNECTED;
			this.connectedDevice_ = null;
			this.connectedDescriptorId_ = null;
			return {
				success: false,
				error: error instanceof Error ? error.message : "Connection failed",
			};
		}
	}

	async disconnect(): Promise<BLEResult> {
		if (!this.connectedDevice_) {
			return { success: true };
		}
		try {
			this.connectionState_ = BLEConnectionState.DISCONNECTING;
			await BleClient.disconnect(this.connectedDevice_.deviceId);
			this.onDisconnect_();
			return { success: true };
		} catch (error) {
			this.onDisconnect_();
			return {
				success: false,
				error: error instanceof Error ? error.message : "Disconnect failed",
			};
		}
	}

	private onDisconnect_(): void {
		this.connectedDevice_ = null;
		this.connectedDescriptorId_ = null;
		this.connectionState_ = BLEConnectionState.DISCONNECTED;
	}

	get state(): BLEConnectionState {
		return this.connectionState_;
	}

	get device(): BleDevice | null {
		return this.connectedDevice_;
	}

	get descriptorId(): string | null {
		return this.connectedDescriptorId_;
	}

	get isConnected(): boolean {
		return (
			this.connectionState_ === BLEConnectionState.CONNECTED && this.connectedDevice_ !== null
		);
	}

	assertConnected(): BleDevice {
		if (!this.connectedDevice_ || !this.isConnected) {
			throw new Error("Not connected");
		}
		return this.connectedDevice_;
	}
}

export const transportBleClient = new TransportBleClient();
