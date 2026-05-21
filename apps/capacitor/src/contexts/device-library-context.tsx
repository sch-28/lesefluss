/**
 * DeviceLibraryContext - tracks which books are on the connected device.
 *
 * Sits between BLEContext (raw connection state) and BookSyncContext (transfer
 * orchestration). Fetches the device's library snapshot once on connect, and
 * exposes a refresh hook so upload/delete sites can re-pull immediately.
 *
 * Two flavors per device kind:
 *   - Multi-book: holds the array of MultiBookLibraryEntry + active book hash.
 *   - Single-book: holds the storage char's `book_hash` (or "" when empty).
 *
 * Consumers use `useBookDeviceState(bookId)` for per-book presence checks; it
 * derives state from this context plus a precomputed device hash for the book.
 */

import type React from "react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { useBLE } from "../contexts/ble-context";
import { ble } from "../services/ble";
import { createBleAdapter } from "../services/ble-transport";
import {
	MULTI_BOOK_DESCRIPTOR_ID,
	type MultiBookLibraryEntry,
	multiBookDescriptor,
	SINGLE_BOOK_DESCRIPTOR_ID,
} from "../services/devices";
import { computeOnDeviceHash, type DeviceCategory } from "../services/devices/hash";
import { log } from "../utils/log";

type DeviceLibrarySnapshot =
	| { kind: "multi"; library: MultiBookLibraryEntry[]; activeHash: string }
	| { kind: "single"; bookHash: string }
	| { kind: "none" };

type DeviceLibraryContextType = {
	snapshot: DeviceLibrarySnapshot;
	refresh: () => Promise<void>;
};

const DeviceLibraryContext = createContext<DeviceLibraryContextType | undefined>(undefined);

export const useDeviceLibrary = () => {
	const ctx = useContext(DeviceLibraryContext);
	if (!ctx) {
		throw new Error("useDeviceLibrary must be used within DeviceLibraryProvider");
	}
	return ctx;
};

export const DeviceLibraryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const { isConnected, connectedDescriptorId, connectedDevice } = useBLE();
	const [snapshot, setSnapshot] = useState<DeviceLibrarySnapshot>({ kind: "none" });

	const refresh = useCallback(async () => {
		if (!isConnected) {
			setSnapshot({ kind: "none" });
			return;
		}

		if (
			connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID &&
			connectedDevice?.deviceId
		) {
			const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
			const [libRes, activeRes] = await Promise.all([
				adapter.read("library"),
				adapter.read("active"),
			]);
			if (!libRes.success) {
				log.warn("device-library", "library read failed:", libRes.error);
				return;
			}
			setSnapshot({
				kind: "multi",
				library: libRes.data ?? [],
				activeHash: activeRes.success ? (activeRes.data?.hash ?? "") : "",
			});
			return;
		}

		if (connectedDescriptorId === SINGLE_BOOK_DESCRIPTOR_ID) {
			const storageRes = await ble.readStorage();
			if (!storageRes.success) {
				log.warn("device-library", "storage read failed:", storageRes.error);
				return;
			}
			setSnapshot({ kind: "single", bookHash: storageRes.data?.book_hash ?? "" });
			return;
		}

		setSnapshot({ kind: "none" });
	}, [isConnected, connectedDescriptorId, connectedDevice?.deviceId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<DeviceLibraryContext.Provider value={{ snapshot, refresh }}>
			{children}
		</DeviceLibraryContext.Provider>
	);
};

export type BookDeviceState = {
	/** True when the app is connected to any known device kind. */
	isReachable: boolean;
	/** True when this book exists on the connected device. */
	isOnDevice: boolean;
	/** True when this book is the device's currently-displayed / active book. */
	isActiveOnDevice: boolean;
	/** Descriptor id of the connected device, or null. */
	descriptorId: string | null;
};

const DISCONNECTED_STATE: BookDeviceState = {
	isReachable: false,
	isOnDevice: false,
	isActiveOnDevice: false,
	descriptorId: null,
};

/**
 * Derive per-book device-presence state from the current device library
 * snapshot. Pure consumer of DeviceLibraryContext; no BLE call per invocation.
 */
export function useBookDeviceState(bookId: string | null | undefined): BookDeviceState {
	const { snapshot } = useDeviceLibrary();

	if (!bookId || snapshot.kind === "none") {
		return DISCONNECTED_STATE;
	}

	if (snapshot.kind === "single") {
		const isOnDevice = snapshot.bookHash !== "" && snapshot.bookHash === bookId;
		return {
			isReachable: true,
			isOnDevice,
			isActiveOnDevice: isOnDevice,
			descriptorId: SINGLE_BOOK_DESCRIPTOR_ID,
		};
	}

	// Multi-book: a lesefluss bookId may live on the device as either category.
	// Compute both candidate hashes and look for either.
	const candidates: Array<{ hash: string; category: DeviceCategory }> = [
		{ hash: computeOnDeviceHash(bookId, "book"), category: "book" },
		{ hash: computeOnDeviceHash(bookId, "article"), category: "article" },
	];
	const match = candidates.find((c) => snapshot.library.some((entry) => entry.hash === c.hash));
	return {
		isReachable: true,
		isOnDevice: match !== undefined,
		isActiveOnDevice: match !== undefined && snapshot.activeHash === match.hash,
		descriptorId: MULTI_BOOK_DESCRIPTOR_ID,
	};
}
