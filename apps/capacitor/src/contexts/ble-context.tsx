import { Preferences } from "@capacitor/preferences";
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
import { createBleAdapter } from "../services/ble-transport";
import { queries } from "../services/db/queries";
import type { Settings as RSVPSettings } from "../services/db/schema";
import { MULTI_BOOK_DESCRIPTOR_ID, multiBookDescriptor } from "../services/devices";
import { log } from "../utils/log";
import { IS_WEB } from "../utils/platform";

const BLE_ENABLED_KEY = "ble_enabled";
const PAIRING_V2_MIGRATED_KEY = "paired_v2_migrated";

async function getBLEEnabled(): Promise<boolean> {
	const { value } = await Preferences.get({ key: BLE_ENABLED_KEY });
	return value === "true";
}

async function saveBLEEnabled(enabled: boolean): Promise<void> {
	await Preferences.set({ key: BLE_ENABLED_KEY, value: String(enabled) });
}

/**
 * One-shot: wipe the legacy `devices` row so the new explicit-pair flow
 * doesn't silently treat the last auto-connected device as paired. The flag
 * is only set on success so a failed wipe is retried on next launch.
 */
async function runPairingV2MigrationOnce(): Promise<void> {
	const { value } = await Preferences.get({ key: PAIRING_V2_MIGRATED_KEY });
	if (value === "true") return;
	await queries.clearAllDevices();
	await Preferences.set({ key: PAIRING_V2_MIGRATED_KEY, value: "true" });
}

interface BLEContextType {
	// Connection state
	isConnected: boolean;
	connectionState: BLEConnectionState;
	connectedDevice: BleDevice | null;
	connectedDescriptorId: string | null;

	// Scanning state
	isScanning: boolean;
	scannedDevices: ScannedDevice[];

	// BLE opt-in
	bleEnabled: boolean;
	toggleBLEEnabled: () => Promise<void>;

	// Operations
	startScan: () => Promise<void>;
	stopScan: () => Promise<void>;
	connect: (deviceId: string) => Promise<boolean>;
	disconnect: () => Promise<void>;
	/**
	 * Remove a device from the paired set. If currently connected to it,
	 * disconnect first. Auto-scan resumes afterwards.
	 */
	forget: (deviceId: string) => Promise<void>;
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

const sameDevice = (a: BleDevice | null, b: BleDevice | null): boolean => {
	if (a === b) return true;
	if (a == null || b == null) return false;
	return a.deviceId === b.deviceId && a.name === b.name;
};

export const BLEProvider: React.FC<BLEProviderProps> = ({ children }) => {
	const [isConnected, setIsConnected] = useState(false);
	const [connectionState, setConnectionState] = useState<BLEConnectionState>(
		BLEConnectionState.DISCONNECTED,
	);
	const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
	const [connectedDescriptorId, setConnectedDescriptorId] = useState<string | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [scanTrigger, setScanTrigger] = useState(0);
	const [bleEnabled, setBleEnabled] = useState(false);
	// `lastConnected DESC` so the find() in the auto-connect effect picks the
	// most-recently-paired visible device.
	const [pairedIds, setPairedIds] = useState<string[]>([]);

	const refreshPaired = useCallback(async () => {
		try {
			const rows = await queries.getPairedDevices();
			setPairedIds(rows.map((r) => r.id));
		} catch (err) {
			log.error("ble", "Failed to load paired devices:", err);
		}
	}, []);

	// Ref so auto-scan effect sees the latest value synchronously (no stale closure race)
	const isConnectingRef = useRef(false);
	// Optional post-connect hook (used by BookSyncContext)
	const onConnectedRef = useRef<((deviceId: string) => void) | null>(null);

	// Migration must finish before paired-set load so legacy rows don't leak in.
	// getBLEEnabled is independent of both so it runs in parallel.
	useEffect(() => {
		(async () => {
			const [, enabled] = await Promise.all([
				runPairingV2MigrationOnce().catch((err) => {
					log.error("ble", "pairing v2 migration failed:", err);
				}),
				getBLEEnabled().catch(() => false),
			]);
			setBleEnabled(enabled);
			await refreshPaired();
		})();
	}, [refreshPaired]);

	// Initialize BLE on mount (native platforms only, when opted in)
	useEffect(() => {
		if (IS_WEB) return;
		if (!bleEnabled) return;
		const init = async () => {
			const result = await bleClient.initialize();
			if (!result.success) {
				setError(result.error || "Failed to initialize BLE");
			}
		};
		init();
	}, [bleEnabled]);

	// Poll connection state from the bleClient singleton (native only, when opted in).
	// Each tick MUST early-out when nothing changed: bleClient.connectedDevice is a
	// getter that may return a fresh object reference per call. Unconditional
	// setState would re-render every BLE-context consumer (and their downstream
	// trees) at 2 Hz forever, starving the main thread once enough subscribers
	// accumulate. Symptom: touch events stop dispatching while console.log + scroll
	// + programmatic .click() still work.
	useEffect(() => {
		if (IS_WEB) return;
		if (!bleEnabled) return;
		let prevConnected = bleClient.connectionState === BLEConnectionState.CONNECTED;
		const interval = setInterval(() => {
			const state = bleClient.connectionState;
			const device = bleClient.connectedDevice;
			const descId = bleClient.connectedDescriptorId;
			const nowConnected = state === BLEConnectionState.CONNECTED;

			setConnectionState((prev) => (prev === state ? prev : state));
			setIsConnected((prev) => (prev === nowConnected ? prev : nowConnected));
			setConnectedDevice((prev) => (sameDevice(prev, device) ? prev : device));
			setConnectedDescriptorId((prev) => (prev === descId ? prev : descId));

			if (prevConnected && !nowConnected) {
				setScanTrigger((n) => n + 1);
			}
			prevConnected = nowConnected;
		}, 500);

		return () => clearInterval(interval);
	}, [bleEnabled]);

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
			setConnectedDescriptorId(bleClient.connectedDescriptorId);
			setConnectionState(BLEConnectionState.CONNECTED);
			setIsConnected(true);
			setScannedDevices([]);
			isConnectingRef.current = false;

			// Save device row = pair. Presence in `devices` is what gates future
			// silent auto-connect.
			try {
				await queries.saveDevice({
					id: result.data.deviceId,
					name: result.data.name || "Lesefluss",
					lastConnected: Date.now(),
					descriptorId: bleClient.connectedDescriptorId,
				});
				await refreshPaired();
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
	}, [refreshPaired]);

	const disconnect = useCallback(async () => {
		if (IS_WEB) return;
		setError(null);

		const result = await bleClient.disconnect();

		if (!result.success) {
			setError(result.error || "Failed to disconnect");
		}

		setIsConnected(false);
		setConnectedDevice(null);
		setConnectedDescriptorId(null);
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

			if (connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID && connectedDevice?.deviceId) {
				// Most rsvp/display/typography fields are device-specific and stay
				// local to whichever device the user is configuring. WPM is the
				// one canonical reading-speed concept that maps cleanly across
				// devices, so we sync just that for now. Future fields land here
				// as the rsvpnano ↔ lesefluss shape mapping grows.
				const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
				const result = await adapter.write("settings", { wpm: settings.wpm });
				if (!result.success) {
					setError(result.error || "Failed to sync settings to device");
					return false;
				}
				return true;
			}

			const result = await ble.writeSettings(settings);
			if (!result.success) {
				setError(result.error || "Failed to sync settings to device");
				return false;
			}
			return true;
		},
		[isConnected, connectedDescriptorId, connectedDevice?.deviceId],
	);

	const syncFromDevice = async (): Promise<RSVPSettings | null> => {
		if (IS_WEB) return null;
		setError(null);

		if (!isConnected) {
			setError("Not connected to device");
			return null;
		}

		if (connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID && connectedDevice?.deviceId) {
			// Multi-book settings JSON shape ≠ RSVPSettings; only fields with a
			// clean cross-device meaning get mapped. Today: WPM (under
			// `reading.wpm`). The rest stays device-local.
			const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
			const result = await adapter.read("settings");
			if (!result.success || !result.data) {
				setError(result.error || "Failed to read settings from device");
				return null;
			}
			const envelope = result.data as Record<string, unknown>;
			if (envelope.ok === false) {
				setError(typeof envelope.error === "string" ? envelope.error : "Settings unavailable");
				return null;
			}
			const reading = envelope.reading as { wpm?: number } | undefined;
			const wpm = typeof reading?.wpm === "number" ? reading.wpm : null;
			try {
				const currentSettings = await queries.getSettings();
				return wpm == null ? currentSettings : { ...currentSettings, wpm };
			} catch (err) {
				log.error("ble", "Failed to merge settings:", err);
				setError("Failed to process settings from device");
				return null;
			}
		}

		const result = await ble.readSettings();
		if (!result.success || !result.data) {
			setError(result.error || "Failed to read settings from device");
			return null;
		}
		try {
			const currentSettings = await queries.getSettings();
			return { ...currentSettings, ...result.data };
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

	// Auto-scan when not connected and not already scanning/connecting (native only, when opted in).
	// scanTrigger is included so a disconnect or failed connect always re-fires this
	// effect even when isScanning and isConnected haven't changed value.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scanTrigger is an intentional re-fire trigger, not read inside the effect
	useEffect(() => {
		if (IS_WEB) return;
		if (!bleEnabled) return;
		if (!isScanning && !isConnected && !isConnectingRef.current) {
			startScan();
		}
	}, [isScanning, isConnected, scanTrigger, startScan, bleEnabled]);

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

	// Pick the most-recently-paired device visible in the current scan results.
	// Unknown devices stay in the list for the user to tap (= pair).
	useEffect(() => {
		if (!bleEnabled) return;
		if (isConnected || isConnectingRef.current) return;
		if (pairedIds.length === 0 || scannedDevices.length === 0) return;
		const scannedById = new Map(scannedDevices.map((d) => [d.device.deviceId, d]));
		const match = pairedIds.find((id) => scannedById.has(id));
		if (!match) return;
		log("ble", `paired device ${match} in range, auto-connecting...`);
		handleDeviceSelect(match);
	}, [scannedDevices, isConnected, handleDeviceSelect, bleEnabled, pairedIds]);

	const forget = useCallback(
		async (deviceId: string) => {
			if (IS_WEB) return;
			// Drop pairedIds + scannedDevices BEFORE any await so the auto-connect
			// effect can't re-fire with stale state in the same tick the native
			// disconnect callback flips bleClient.connectionState.
			setPairedIds((prev) => prev.filter((id) => id !== deviceId));
			setScannedDevices((prev) => prev.filter((d) => d.device.deviceId !== deviceId));

			if (isConnected && connectedDevice?.deviceId === deviceId) {
				const r = await bleClient.disconnect();
				if (!r.success) log.warn("ble", "disconnect during forget failed:", r.error);
				setIsConnected(false);
				setConnectedDevice(null);
				setConnectedDescriptorId(null);
				setConnectionState(BLEConnectionState.DISCONNECTED);
			}
			try {
				await queries.forgetDevice(deviceId);
			} catch (err) {
				log.error("ble", "Failed to forget device:", err);
			}
			await refreshPaired();
			setScanTrigger((n) => n + 1);
		},
		[isConnected, connectedDevice?.deviceId, refreshPaired],
	);

	const toggleBLEEnabled = useCallback(async () => {
		const next = !bleEnabled;
		if (!next) {
			if (isScanning) {
				const r = await bleClient.stopScan();
				if (!r.success) log.warn("ble", "stopScan during disable failed:", r.error);
				setIsScanning(false);
				setScannedDevices([]);
			}
			if (isConnected) {
				const r = await bleClient.disconnect();
				if (!r.success) log.warn("ble", "disconnect during disable failed:", r.error);
				setIsConnected(false);
				setConnectedDevice(null);
				setConnectedDescriptorId(null);
				setConnectionState(BLEConnectionState.DISCONNECTED);
			}
		}
		await saveBLEEnabled(next);
		setBleEnabled(next);
	}, [bleEnabled, isScanning, isConnected]);

	const value: BLEContextType = {
		isConnected,
		connectionState,
		connectedDevice,
		connectedDescriptorId,
		isScanning,
		scannedDevices,
		bleEnabled,
		toggleBLEEnabled,
		startScan,
		stopScan,
		connect,
		disconnect,
		forget,
		syncToDevice,
		syncFromDevice,
		onConnected,
		error,
		clearError,
	};

	return <BLEContext.Provider value={value}>{children}</BLEContext.Provider>;
};
