/**
 * Descriptor for the rsvpnano device (multi-book, word-index position).
 *
 * UUIDs come from the `multibook` namespace in `@lesefluss/ble-config`.
 * The transfer protocol (JSON header frame + raw byte chunks + ACK:END
 * notification) is custom to this device and lives in transfer-impl.ts.
 */

import { multibook } from "@lesefluss/ble-config";
import type { WordPosition } from "@lesefluss/core";
import { jsonCodec } from "../../ble-transport/codecs";
import type { DeviceDescriptor } from "../../ble-transport/types";
import { fetchMultiBookLibrary } from "./library-fetch-impl";
import { transferMultiBook } from "./transfer-impl";

export type MultiBookInfo = {
	deviceName: string;
	fwVersion: string;
	protoVersion: number;
};

export type MultiBookLibraryEntry = {
	hash: string;
	title: string;
	author: string;
	words: number;
	progressWords: number;
	category: "book" | "article";
};

export type MultiBookActive = { hash: string };
export type MultiBookPosition = { hash: string; wordIndex: WordPosition };
export type MultiBookStorage = {
	freeBytes: number;
	totalBytes: number;
	bookCount: number;
};
export type MultiBookSettings = Record<string, unknown>;
export type MultiBookDeleteRequest = { hash: string };

export const MULTI_BOOK_DESCRIPTOR_ID = "rsvpnano-multi-book-v1";

const chars = multibook.characteristics;

export const multiBookDescriptor = {
	id: MULTI_BOOK_DESCRIPTOR_ID,
	deviceName: multibook.deviceName,
	serviceUuid: multibook.serviceUuid,
	chars: {
		info: {
			uuid: chars.info.uuid,
			access: "R",
			codec: jsonCodec<MultiBookInfo>(),
		},
		library: {
			// Notify-stream only. Adapter exposes `fetchLibrary()`; this codec is
			// kept to satisfy the CharDescriptor type but is never invoked (the
			// adapter has no `read`/`write` path that would touch it).
			uuid: chars.library.uuid,
			access: "W+N",
			codec: jsonCodec<MultiBookLibraryEntry[]>(),
		},
		active: {
			uuid: chars.active.uuid,
			access: "RW",
			codec: jsonCodec<MultiBookActive>(),
		},
		position: {
			uuid: chars.position.uuid,
			access: "RW",
			codec: jsonCodec<MultiBookPosition>(),
		},
		settings: {
			uuid: chars.settings.uuid,
			access: "RW",
			codec: jsonCodec<MultiBookSettings>(),
		},
		storage: {
			uuid: chars.storage.uuid,
			access: "R",
			codec: jsonCodec<MultiBookStorage>(),
		},
		delete: {
			uuid: chars.delete.uuid,
			access: "W+N",
			codec: jsonCodec<MultiBookDeleteRequest>(),
		},
	},
	transfer: transferMultiBook,
	libraryFetch: fetchMultiBookLibrary,
} as const satisfies DeviceDescriptor;
