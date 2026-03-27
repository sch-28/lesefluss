import { BleClient, type BleDevice, type ScanResult } from "@capacitor-community/bluetooth-le";
import { BLE_CONFIG, BLEConnectionState, type BLEResult } from "../constants/ble";
import type { Settings } from "../db/schema";

// Re-export so callers don't need to import from two places
export type { Settings as RSVPSettings };

/**
 * Scanned BLE device with RSSI
 */
export interface ScannedDevice {
	device: BleDevice;
	rssi: number;
	name: string;
}

/**
 * ESP32 Settings format (matches JSON from device).
 */
interface ESP32Settings {
	wpm: number;
	delay_comma: number;
	delay_period: number;
	accel_start: number;
	accel_rate: number;
	x_offset: number;
	word_offset: number;
	inverse: boolean;
	ble_on: boolean;
	dev_mode: boolean;
}

/**
 * BLE Service for RSVP Reader ESP32 communication
 *
 * Handles:
 * - Device scanning and discovery
 * - Connection management
 * - Settings read/write via JSON characteristic
 * - Error handling and retries
 */
class BLEService {
	private connectedDevice: BleDevice | null = null;
	private connectionState: BLEConnectionState = BLEConnectionState.DISCONNECTED;
	private scanCallback: ((devices: ScannedDevice[]) => void) | null = null;
	private scannedDevices: Map<string, ScannedDevice> = new Map();

	/**
	 * Initialize BLE client (request permissions)
	 */
	async initialize(): Promise<BLEResult> {
		try {
			await BleClient.initialize();
			console.log("BLE initialized successfully");
			return { success: true };
		} catch (error) {
			console.error("Failed to initialize BLE:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Start scanning for RSVP Reader devices
	 * @param onDeviceFound Callback when devices are found
	 */
	async startScan(onDeviceFound: (devices: ScannedDevice[]) => void): Promise<BLEResult> {
		try {
			this.scannedDevices.clear();
			this.scanCallback = onDeviceFound;

			await BleClient.requestLEScan(
				{
					// Filter by device name
					namePrefix: BLE_CONFIG.DEVICE_NAME,
				},
				(result: ScanResult) => {
					const device: ScannedDevice = {
						device: result.device,
						rssi: result.rssi ?? -100, // Default to -100 if undefined
						name: result.localName || result.device.name || "Unknown",
					};

					// Store device (updates if already exists)
					this.scannedDevices.set(result.device.deviceId, device);

					// Notify callback with all devices
					if (this.scanCallback) {
						this.scanCallback(Array.from(this.scannedDevices.values()));
					}
				},
			);

			console.log("Started scanning for BLE devices");
			return { success: true };
		} catch (error) {
			console.error("Failed to start BLE scan:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to start scan",
			};
		}
	}

	/**
	 * Stop scanning for devices
	 */
	async stopScan(): Promise<BLEResult> {
		try {
			await BleClient.stopLEScan();
			this.scanCallback = null;
			console.log("Stopped scanning for BLE devices");
			return { success: true };
		} catch (error) {
			console.error("Failed to stop BLE scan:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to stop scan",
			};
		}
	}

	/**
	 * Connect to a BLE device
	 */
	async connect(deviceId: string): Promise<BLEResult<BleDevice>> {
		if (this.connectionState !== BLEConnectionState.DISCONNECTED) {
			return {
				success: false,
				error: "Already connected or connecting to a device",
			};
		}

		try {
			this.connectionState = BLEConnectionState.CONNECTING;

			// Stop scanning if active
			await this.stopScan();

			// Connect to device with timeout
			await BleClient.connect(
				deviceId,
				(disconnectedDeviceId) => {
					console.log("Device disconnected:", disconnectedDeviceId);
					this.handleDisconnect();
				},
				{ timeout: BLE_CONFIG.CONNECTION_TIMEOUT },
			);

			// Find device info from scanned devices
			const deviceInfo = this.scannedDevices.get(deviceId);
			this.connectedDevice = deviceInfo?.device || { deviceId };
			this.connectionState = BLEConnectionState.CONNECTED;

			console.log("Connected to device:", deviceId);
			return { success: true, data: this.connectedDevice };
		} catch (error) {
			this.connectionState = BLEConnectionState.DISCONNECTED;
			this.connectedDevice = null;
			console.error("Failed to connect to device:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Connection failed",
			};
		}
	}

	/**
	 * Disconnect from current device
	 */
	async disconnect(): Promise<BLEResult> {
		if (!this.connectedDevice) {
			return { success: true };
		}

		try {
			this.connectionState = BLEConnectionState.DISCONNECTING;
			await BleClient.disconnect(this.connectedDevice.deviceId);
			this.handleDisconnect();
			console.log("Disconnected from device");
			return { success: true };
		} catch (error) {
			console.error("Failed to disconnect:", error);
			this.handleDisconnect(); // Ensure cleanup
			return {
				success: false,
				error: error instanceof Error ? error.message : "Disconnect failed",
			};
		}
	}

	/**
	 * Read settings from device
	 */
	async readSettings(): Promise<BLEResult<Partial<Settings>>> {
		if (!this.connectedDevice || this.connectionState !== BLEConnectionState.CONNECTED) {
			return { success: false, error: "Not connected to device" };
		}

		try {
			// Read characteristic value
			const result = await BleClient.read(
				this.connectedDevice.deviceId,
				BLE_CONFIG.SERVICE_UUID,
				BLE_CONFIG.SETTINGS_CHARACTERISTIC_UUID,
			);

			// Convert DataView to string
			const jsonString = this.dataViewToString(result);
			console.log("Read settings from device:", jsonString);

			// Parse JSON
			const esp32Settings: ESP32Settings = JSON.parse(jsonString);

			// Convert ESP32 format to app format
			const appSettings: Partial<Settings> = {
				wpm: esp32Settings.wpm,
				delayComma: esp32Settings.delay_comma,
				delayPeriod: esp32Settings.delay_period,
				accelStart: esp32Settings.accel_start,
				accelRate: esp32Settings.accel_rate,
				xOffset: esp32Settings.x_offset,
				wordOffset: esp32Settings.word_offset,
				inverse: esp32Settings.inverse,
				bleOn: esp32Settings.ble_on,
				devMode: esp32Settings.dev_mode,
			};

			return { success: true, data: appSettings };
		} catch (error) {
			console.error("Failed to read settings:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to read settings",
			};
		}
	}

	/**
	 * Write settings to device
	 */
	async writeSettings(settings: Partial<Settings>): Promise<BLEResult> {
		if (!this.connectedDevice || this.connectionState !== BLEConnectionState.CONNECTED) {
			return { success: false, error: "Not connected to device" };
		}

		try {
			// Convert app settings format to ESP32 JSON format
			const esp32Settings: ESP32Settings = {
				wpm: settings.wpm!,
				delay_comma: settings.delayComma!,
				delay_period: settings.delayPeriod!,
				accel_start: settings.accelStart!,
				accel_rate: settings.accelRate!,
				x_offset: settings.xOffset!,
				word_offset: settings.wordOffset!,
				inverse: settings.inverse!,
				ble_on: settings.bleOn!,
				dev_mode: settings.devMode!,
			};

			// Convert to JSON string
			const jsonString = JSON.stringify(esp32Settings);
			console.log("Writing settings to device:", jsonString);

			// Convert string to DataView
			const dataView = this.stringToDataView(jsonString);

			// Write to characteristic
			await BleClient.write(
				this.connectedDevice.deviceId,
				BLE_CONFIG.SERVICE_UUID,
				BLE_CONFIG.SETTINGS_CHARACTERISTIC_UUID,
				dataView,
			);

			console.log("Settings written to device successfully");
			return { success: true };
		} catch (error) {
			console.error("Failed to write settings:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to write settings",
			};
		}
	}

	/**
	 * Check if device is connected
	 */
	isConnected(): boolean {
		return this.connectionState === BLEConnectionState.CONNECTED && this.connectedDevice !== null;
	}

	/**
	 * Get current connection state
	 */
	getConnectionState(): BLEConnectionState {
		return this.connectionState;
	}

	/**
	 * Get connected device info
	 */
	getConnectedDevice(): BleDevice | null {
		return this.connectedDevice;
	}

	/**
	 * Handle disconnect (cleanup)
	 */
	private handleDisconnect(): void {
		this.connectedDevice = null;
		this.connectionState = BLEConnectionState.DISCONNECTED;
	}

	/**
	 * Convert DataView to string
	 */
	private dataViewToString(dataView: DataView): string {
		const decoder = new TextDecoder("utf-8");
		return decoder.decode(dataView);
	}

	/**
	 * Convert string to DataView
	 */
	private stringToDataView(str: string): DataView {
		const encoder = new TextEncoder();
		const uint8Array = encoder.encode(str);
		return new DataView(uint8Array.buffer);
	}
}

// Singleton instance
export const bleService = new BLEService();
