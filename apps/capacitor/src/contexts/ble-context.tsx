import type { BleDevice } from "@capacitor-community/bluetooth-le";
import type React from "react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { BLEConnectionState, ble, bleClient, type ScannedDevice } from "../services/ble";
import { queries } from "../services/db/queries";
import type { Settings as RSVPSettings } from "../services/db/schema";
import { log } from "../utils/log";
import { IS_WEB } from "../utils/platform";

interface BLEContextType {
	// Connection state
	isConnected: boolean;
	connectionState: BLEConnectionState;
	connectedDevice: BleDevice | null;

	// Scanning state
	isScanning: boolean;
	scannedDevices: ScannedDevice[];

	// Operations
	startScan: () => Promise<void>;
	stopScan: () => Promise<void>;
	connect: (deviceId: string) => Promise<boolean>;
	disconnect: () => Promise<void>;
	syncToDevice: (settings: Omit<RSVPSettings, "id" | "updatedAt">) => Promise<boolean>;
	syncFromDevice: () => Promise<RSVPSettings | null>;

	/**
	 * Register a callback to run after a successful connect.
	 * BookSyncContext uses this to trigger position sync.
	 * Only one callback is supported at a time (last registration wins).
	 */
	onConnected: (cb: (deviceId: string) => void) => void;

	// Error state
	error: string | null;
	clearError: () => void;
}

const BLEContext = createContext<BLEContextType | undefined>(undefined);

export const useBLE = () => {
	const context = useContext(BLEContext);
	if (!context) {
		throw new Error("useBLE must be used within BLEProvider");
	}
	return context;
};

interface BLEProviderProps {
	children: ReactNode;
}

export const BLEProvider: React.FC<BLEProviderProps> = ({ children }) => {
	const [isConnected, setIsConnected] = useState(false);
	const [connectionState, setConnectionState] = useState<BLEConnectionState>(
		BLEConnectionState.DISCONNECTED,
	);
	const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [scanTrigger, setScanTrigger] = useState(0);

	// Ref so auto-scan effect sees the latest value synchronously (no stale closure race)
	const isConnectingRef = useRef(false);
	// Optional post-connect hook (used by BookSyncContext)
	const onConnectedRef = useRef<((deviceId: string) => void) | null>(null);

	// Initialize BLE on mount (native platforms only)
	useEffect(() => {
		if (IS_WEB) return;
		const init = async () => {
			const result = await bleClient.initialize();
			if (!result.success) {
				setError(result.error || "Failed to initialize BLE");
			}
		};
		init();
	}, []);

	// Poll connection state from the bleClient singleton (native only)
	useEffect(() => {
		if (IS_WEB) return;
		let prevConnected = bleClient.connectionState === BLEConnectionState.CONNECTED;
		const interval = setInterval(() => {
			const state = bleClient.connectionState;
			const device = bleClient.connectedDevice;
			const nowConnected = state === BLEConnectionState.CONNECTED;

			setConnectionState(state);
			setIsConnected(nowConnected);
			setConnectedDevice(device);

			if (prevConnected && !nowConnected) {
				setScanTrigger((n) => n + 1);
			}
			prevConnected = nowConnected;
		}, 500);

		return () => clearInterval(interval);
	}, []);

	const startScan = useCallback(async () => {
		if (IS_WEB) return;
		setError(null);
		setScannedDevices([]);
		setIsScanning(true);

		const result = await bleClient.startScan((devices) => {
			setScannedDevices(devices);
		});

		if (!result.success) {
			setError(result.error || "Failed to start scan");
			setIsScanning(false);
		}
	}, []);

	const stopScan = useCallback(async () => {
		if (IS_WEB) {
			setIsScanning(false);
			return;
		}
		const result = await bleClient.stopScan();
		setIsScanning(false);

		if (!result.success) {
			setError(result.error || "Failed to stop scan");
		}
	}, []);

	const connect = useCallback(async (deviceId: string): Promise<boolean> => {
		if (IS_WEB) return false;
		setError(null);

		const result = await bleClient.connect(deviceId);
		log("ble", "connect result:", JSON.stringify(result));

		if (result.success && result.data) {
			setConnectedDevice(result.data);
			setConnectionState(BLEConnectionState.CONNECTED);
			setIsConnected(true);
			setScannedDevices([]);
			isConnectingRef.current = false;

			// Save device to database
			try {
				await queries.saveDevice({
					id: result.data.deviceId,
					name: result.data.name || "Lesefluss",
					lastConnected: Date.now(),
				});
			} catch (err) {
				log.error("ble", "Failed to save device to database:", err);
			}

			// Notify any registered post-connect hook (e.g. BookSyncContext)
			onConnectedRef.current?.(result.data.deviceId);

			return true;
		}
		log.error("ble", "Failed to connect:", result.error);
		setError(result.error || "Failed to connect");
		return false;
	}, []);

	const disconnect = useCallback(async () => {
		if (IS_WEB) return;
		setError(null);

		const result = await bleClient.disconnect();

		if (!result.success) {
			setError(result.error || "Failed to disconnect");
		}

		setIsConnected(false);
		setConnectedDevice(null);
		setConnectionState(BLEConnectionState.DISCONNECTED);
		// Bump trigger so auto-scan always re-fires after a disconnect,
		// even if isScanning was already false when the effect last ran.
		setScanTrigger((n) => n + 1);
	}, []);

	const syncToDevice = useCallback(
		async (settings: Omit<RSVPSettings, "id" | "updatedAt">): Promise<boolean> => {
			if (IS_WEB) return false;
			setError(null);

			if (!isConnected) {
				setError("Not connected to device");
				return false;
			}

			const result = await ble.writeSettings(settings);

			if (!result.success) {
				setError(result.error || "Failed to sync settings to device");
				return false;
			}

			return true;
		},
		[isConnected],
	);

	const syncFromDevice = async (): Promise<RSVPSettings | null> => {
		if (IS_WEB) return null;
		setError(null);

		if (!isConnected) {
			setError("Not connected to device");
			return null;
		}

		const result = await ble.readSettings();

		if (!result.success || !result.data) {
			setError(result.error || "Failed to read settings from device");
			return null;
		}

		// Merge with current settings (preserve id and updatedAt)
		try {
			const currentSettings = await queries.getSettings();
			const mergedSettings: RSVPSettings = {
				...currentSettings,
				...result.data,
			};
			return mergedSettings;
		} catch (err) {
			log.error("ble", "Failed to merge settings:", err);
			setError("Failed to process settings from device");
			return null;
		}
	};

	const clearError = () => setError(null);

	const onConnected = useCallback((cb: (deviceId: string) => void) => {
		onConnectedRef.current = cb;
	}, []);

	// Auto-scan when not connected and not already scanning/connecting (native only).
	// scanTrigger is included so a disconnect or failed connect always re-fires this
	// effect even when isScanning and isConnected haven't changed value.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scanTrigger is an intentional re-fire trigger, not read inside the effect
	useEffect(() => {
		if (IS_WEB) return;
		if (!isScanning && !isConnected && !isConnectingRef.current) {
			startScan();
		}
	}, [isScanning, isConnected, scanTrigger, startScan]);

	const handleDeviceSelect = useCallback(
		async (deviceId: string) => {
			isConnectingRef.current = true;
			await stopScan();

			const MAX_RETRIES = 5;
			for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
				// Backoff: 1s first attempt (ESP32 needs ~500ms to re-advertise
				// cleanly after a disconnect), then 2s, 3s, 4s cap.
				const backoff = Math.min(4000, (attempt + 0.5) * 1000);
				log("ble", `connect attempt ${attempt + 1}/${MAX_RETRIES + 1}, waiting ${backoff}ms...`);
				await new Promise((resolve) => setTimeout(resolve, backoff));

				const success = await connect(deviceId);
				if (success) {
					return;
				}
			}
			// All retries exhausted - fall back to scanning
			log.warn("ble", `all ${MAX_RETRIES + 1} connect attempts failed, falling back to scan`);
			isConnectingRef.current = false;
			setScanTrigger((n) => n + 1);
		},
		[stopScan, connect],
	);

	useEffect(() => {
		if (scannedDevices.length === 1 && !isConnected && !isConnectingRef.current) {
			log("ble", "found 1 device, auto-connecting...");
			handleDeviceSelect(scannedDevices[0].device.deviceId);
		}
	}, [scannedDevices.length, isConnected, handleDeviceSelect, scannedDevices[0]?.device.deviceId]);

	const value: BLEContextType = {
		isConnected,
		connectionState,
		connectedDevice,
		isScanning,
		scannedDevices,
		startScan,
		stopScan,
		connect,
		disconnect,
		syncToDevice,
		syncFromDevice,
		onConnected,
		error,
		clearError,
	};

	return <BLEContext.Provider value={value}>{children}</BLEContext.Provider>;
};
