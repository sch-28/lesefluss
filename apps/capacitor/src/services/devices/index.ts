/**
 * Device descriptor registry.
 *
 * Single source of truth for which BLE devices the app knows how to talk to.
 * Scanning iterates the list to advertise-filter by every known service UUID;
 * the connected-device record persists the matched descriptor's id so the
 * adapter can be re-instantiated on next launch without re-discovery.
 */

import type { DeviceDescriptor } from "../ble-transport/types";
import { MULTI_BOOK_DESCRIPTOR_ID, multiBookDescriptor } from "./multi-book/descriptor";
import { SINGLE_BOOK_DESCRIPTOR_ID, singleBookDescriptor } from "./single-book/descriptor";

export type {
	MultiBookActive,
	MultiBookDeleteRequest,
	MultiBookInfo,
	MultiBookLibraryEntry,
	MultiBookPosition,
	MultiBookSettings,
	MultiBookStorage,
} from "./multi-book/descriptor";
export type {
	SingleBookPosition,
	SingleBookStorage,
} from "./single-book/descriptor";
export {
	MULTI_BOOK_DESCRIPTOR_ID,
	multiBookDescriptor,
	SINGLE_BOOK_DESCRIPTOR_ID,
	singleBookDescriptor,
};

export const DEVICE_DESCRIPTORS: readonly DeviceDescriptor[] = [
	singleBookDescriptor,
	multiBookDescriptor,
] as const;

export function findDescriptor(id: string): DeviceDescriptor | undefined {
	return DEVICE_DESCRIPTORS.find((d) => d.id === id);
}
