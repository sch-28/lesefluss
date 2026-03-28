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
import { BLEConnectionState, ble, bleClient, type ScannedDevice } from "../ble";
import { queries } from "../db/queries";
import type { Settings as RSVPSettings } from "../db/schema";

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
	syncToDevice: (settings: Partial<RSVPSettings>) => Promise<boolean>;
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

	// Ref so auto-scan effect sees the latest value synchronously (no stale closure race)
	const isConnectingRef = useRef(false);
	// Optional post-connect hook (used by BookSyncContext)
	const onConnectedRef = useRef<((deviceId: string) => void) | null>(null);

	// Initialize BLE on mount
	useEffect(() => {
		const init = async () => {
			const result = await bleClient.initialize();
			if (!result.success) {
				setError(result.error || "Failed to initialize BLE");
			}
		};
		init();
	}, []);

	// Poll connection state from the bleClient singleton
	useEffect(() => {
		const interval = setInterval(() => {
			const state = bleClient.connectionState;
			const device = bleClient.connectedDevice;

			setConnectionState(state);
			setIsConnected(state === BLEConnectionState.CONNECTED);
			setConnectedDevice(device);
		}, 500);

		return () => clearInterval(interval);
	}, []);

	const startScan = async () => {
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
	};

	const stopScan = async () => {
		const result = await bleClient.stopScan();
		setIsScanning(false);

		if (!result.success) {
			setError(result.error || "Failed to stop scan");
		}
	};

	const connect = async (deviceId: string): Promise<boolean> => {
		setError(null);
		isConnectingRef.current = true;

		const result = await bleClient.connect(deviceId);

		if (result.success && result.data) {
			setConnectedDevice(result.data);
			setConnectionState(BLEConnectionState.CONNECTED);
			setIsConnected(true);

			// Save device to database
			try {
				await queries.saveDevice({
					id: result.data.deviceId,
					name: result.data.name || "RSVP-Reader",
					lastConnected: Date.now(),
				});
			} catch (err) {
				console.error("Failed to save device to database:", err);
			}

			// Notify any registered post-connect hook (e.g. BookSyncContext)
			onConnectedRef.current?.(result.data.deviceId);

			isConnectingRef.current = false;
			return true;
		}

		setError(result.error || "Failed to connect");
		isConnectingRef.current = false;
		return false;
	};

	const disconnect = async () => {
		setError(null);

		const result = await bleClient.disconnect();

		if (!result.success) {
			setError(result.error || "Failed to disconnect");
		}

		setIsConnected(false);
		setConnectedDevice(null);
		setConnectionState(BLEConnectionState.DISCONNECTED);
	};

	const syncToDevice = async (settings: Partial<RSVPSettings>): Promise<boolean> => {
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
	};

	const syncFromDevice = async (): Promise<RSVPSettings | null> => {
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
			console.error("Failed to merge settings:", err);
			setError("Failed to process settings from device");
			return null;
		}
	};

	const clearError = () => setError(null);

	const onConnected = useCallback((cb: (deviceId: string) => void) => {
		onConnectedRef.current = cb;
	}, []);

	// Auto-scan when not connected and not already scanning/connecting
	useEffect(() => {
		if (!isScanning && !isConnected && !isConnectingRef.current) {
			startScan();
		}
	}, [isScanning, isConnected]);

	const handleDeviceSelect = async (deviceId: string) => {
		await stopScan();
		await connect(deviceId);
	};

	useEffect(() => {
		if (scannedDevices.length === 1 && !isConnected) {
			console.log("[ble] found 1 device, auto-connecting...");
			handleDeviceSelect(scannedDevices[0].device.deviceId);
		}
	}, [scannedDevices.length, isConnected]);

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
