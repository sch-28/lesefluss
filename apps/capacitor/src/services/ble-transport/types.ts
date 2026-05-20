/**
 * Descriptor-driven BLE transport types.
 *
 * A DeviceDescriptor declares a service UUID, a set of characteristics with
 * typed codecs, and an optional transfer implementation. createBleAdapter()
 * (see adapter.ts) consumes a descriptor and returns a typed read/write surface.
 */

import type { BleDevice } from "@capacitor-community/bluetooth-le";

export type BLEResult<T = void> = {
	success: boolean;
	data?: T;
	error?: string;
};

export enum BLEConnectionState {
	DISCONNECTED = "disconnected",
	CONNECTING = "connecting",
	CONNECTED = "connected",
	DISCONNECTING = "disconnecting",
}

export type Codec<T> = {
	// Method shorthand to allow bivariant assignment of `Codec<MyT>` to
	// `Codec<unknown>` in the heterogeneous `DeviceDescriptor.chars` map.
	encode(value: T): DataView;
	decode(view: DataView): T;
};

export type CharAccess = "R" | "RW" | "W+N";

export type CharDescriptor<T> = {
	uuid: string;
	access: CharAccess;
	codec: Codec<T>;
};

export type TransferImpl = (
	deviceId: string,
	content: Uint8Array,
	meta: TransferMeta,
	onProgress: (pct: number) => void,
) => Promise<BLEResult>;

export type TransferMeta = {
	filename: string;
	title?: string;
	category?: "book" | "article";
};

export type DeviceDescriptor = {
	/** Stable identifier persisted with the saved-device record. */
	id: string;
	deviceName: string;
	serviceUuid: string;
	chars: Record<string, CharDescriptor<unknown>>;
	transfer?: TransferImpl;
};

export type ScannedDevice = {
	device: BleDevice;
	rssi: number;
	name: string;
	descriptorId: string;
};
