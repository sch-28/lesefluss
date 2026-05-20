import { useMemo } from "react";
import { useBLE } from "../contexts/ble-context";
import { type Adapter, createBleAdapter } from "../services/ble-transport";
import { MULTI_BOOK_DESCRIPTOR_ID, multiBookDescriptor } from "../services/devices";

/**
 * Returns a multi-book BLE adapter bound to the currently connected device,
 * or null when not connected to a multi-book device. The adapter changes
 * identity only when deviceId changes, so consumers can safely use it in
 * dependency arrays.
 */
export function useMultiBookAdapter(): Adapter<typeof multiBookDescriptor> | null {
	const { connectedDevice, connectedDescriptorId, isConnected } = useBLE();
	const deviceId = connectedDevice?.deviceId ?? null;
	const isMatch =
		isConnected && deviceId !== null && connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID;
	return useMemo(() => {
		if (!isMatch || deviceId === null) {
			return null;
		}
		return createBleAdapter(multiBookDescriptor, deviceId);
	}, [isMatch, deviceId]);
}
