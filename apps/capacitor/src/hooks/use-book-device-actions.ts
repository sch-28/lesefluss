/**
 * Builds the device-related portion of a book action sheet, adapting to the
 * connected device kind and to whether the book is already on the device.
 *
 * Returns an empty array when no device is connected, so callers can spread
 * the result unconditionally.
 */

import { BookOpen, CloudUpload, Trash2 } from "lucide-react";
import { useCallback } from "react";
import type { ActionSheetItem } from "../components/action-sheet";
import { useBLE } from "../contexts/ble-context";
import { useBookDeviceState, useDeviceLibrary } from "../contexts/device-library-context";
import { MULTI_BOOK_DESCRIPTOR_ID, SINGLE_BOOK_DESCRIPTOR_ID } from "../services/devices";
import { computeOnDeviceHash } from "../services/devices/hash";
import { log } from "../utils/log";
import { useMultiBookAdapter } from "./use-multi-book-adapter";

type UseBookDeviceActionsArgs = {
	bookId: string | null;
	bookTitle?: string;
	/** Open the upload modal (TransferModal) for the bookId. */
	onUpload: () => void;
};

export function useBookDeviceActions({
	bookId,
	bookTitle,
	onUpload,
}: UseBookDeviceActionsArgs): ActionSheetItem[] {
	const { isConnected, connectedDescriptorId } = useBLE();
	const deviceState = useBookDeviceState(bookId);
	const { snapshot, refresh: refreshDeviceLibrary } = useDeviceLibrary();
	const multiBookAdapter = useMultiBookAdapter();

	// Resolve the book's actual on-device hash by intersecting both category
	// candidates with the snapshot's library. Avoids issuing speculative writes
	// against the wrong hash (which can time out + drop the connection).
	const resolvedHash = (() => {
		if (!bookId || snapshot.kind !== "multi") {
			return null;
		}
		const candidates = [
			computeOnDeviceHash(bookId, "book"),
			computeOnDeviceHash(bookId, "article"),
		];
		return candidates.find((h) => snapshot.library.some((e) => e.hash === h)) ?? null;
	})();

	// Firmware processes active + delete writes on the Arduino loop tick, not
	// on the NimBLE host task. Refreshing immediately after the write resolves
	// races the drain and reads a stale library. The adapter mutex serializes
	// the BLE ops; this delay covers the on-device drain.
	const POST_WRITE_DRAIN_MS = 150;

	const openOnDevice = useCallback(async () => {
		if (!multiBookAdapter || !resolvedHash) {
			return;
		}
		const result = await multiBookAdapter.write("active", { hash: resolvedHash });
		if (!result.success) {
			log.warn("book-actions", "open on device write failed:", result.error);
			return;
		}
		await new Promise((r) => setTimeout(r, POST_WRITE_DRAIN_MS));
		await refreshDeviceLibrary();
	}, [multiBookAdapter, resolvedHash, refreshDeviceLibrary]);

	const removeFromDevice = useCallback(async () => {
		if (!multiBookAdapter || !resolvedHash) {
			return;
		}
		const result = await multiBookAdapter.write("delete", { hash: resolvedHash });
		if (!result.success) {
			log.warn("book-actions", "remove from device failed:", result.error);
			return;
		}
		await new Promise((r) => setTimeout(r, POST_WRITE_DRAIN_MS));
		await refreshDeviceLibrary();
	}, [multiBookAdapter, resolvedHash, refreshDeviceLibrary]);

	if (!bookId || !isConnected) {
		return [];
	}

	if (connectedDescriptorId === SINGLE_BOOK_DESCRIPTOR_ID) {
		return [
			{
				label: "Send to device",
				icon: CloudUpload,
				onSelect: onUpload,
			},
		];
	}

	if (connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID) {
		if (!deviceState.isOnDevice) {
			return [
				{
					label: "Upload to device",
					icon: CloudUpload,
					onSelect: onUpload,
				},
			];
		}
		const items: ActionSheetItem[] = [];
		if (deviceState.isActiveOnDevice) {
			items.push({
				label: "Reading on device",
				icon: BookOpen,
				disabled: true,
				onSelect: () => {},
			});
		} else {
			items.push({
				label: "Open on device",
				icon: BookOpen,
				onSelect: () => {
					void openOnDevice();
				},
			});
		}
		items.push({
			label: bookTitle ? `Remove "${bookTitle}" from device` : "Remove from device",
			icon: Trash2,
			destructive: true,
			onSelect: () => {
				void removeFromDevice();
			},
		});
		return items;
	}

	return [];
}
