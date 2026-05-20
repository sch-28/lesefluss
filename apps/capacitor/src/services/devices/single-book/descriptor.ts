/**
 * Descriptor for the original lesefluss esp32 (single-book, byte-offset position).
 *
 * Uses the existing single-book schema UUIDs from `@lesefluss/ble-config`.
 * The transfer protocol (START/CHUNK/END with CRC32 + base64) is custom to
 * this device and lives in transfer-impl.ts.
 */

import {
	DEVICE_NAME,
	POSITION_CHAR_UUID,
	SERVICE_UUID,
	SETTINGS_CHAR_UUID,
	STORAGE_CHAR_UUID,
} from "@lesefluss/ble-config";
import { jsonCodec } from "../../ble-transport/codecs";
import type { DeviceDescriptor } from "../../ble-transport/types";
import { transferSingleBook } from "./transfer-impl";

export type SingleBookPosition = { position: number };

export type SingleBookStorage = {
	free_bytes: number;
	total_bytes: number;
	/** 8-char hex ID of the book currently on the device, or "" if none. */
	book_hash: string;
};

export const SINGLE_BOOK_DESCRIPTOR_ID = "lesefluss-single-book-v1";

export const singleBookDescriptor = {
	id: SINGLE_BOOK_DESCRIPTOR_ID,
	deviceName: DEVICE_NAME,
	serviceUuid: SERVICE_UUID,
	chars: {
		settings: {
			uuid: SETTINGS_CHAR_UUID,
			access: "RW",
			codec: jsonCodec<Record<string, unknown>>(),
		},
		position: {
			uuid: POSITION_CHAR_UUID,
			access: "RW",
			codec: jsonCodec<SingleBookPosition>(),
		},
		storage: {
			uuid: STORAGE_CHAR_UUID,
			access: "R",
			codec: jsonCodec<SingleBookStorage>(),
		},
	},
	transfer: transferSingleBook,
} as const satisfies DeviceDescriptor;
