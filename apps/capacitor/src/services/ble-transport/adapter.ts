/**
 * Descriptor → typed adapter factory.
 *
 * Binds a DeviceDescriptor to a connected device id and returns an object
 * exposing read/write methods per characteristic plus an optional
 * transferFile method. Connection lifecycle is owned by the caller; this
 * factory only translates typed calls into BleClient reads/writes.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import type { BLEResult, CharDescriptor, DeviceDescriptor, TransferMeta } from "./types";

type CharsOf<D extends DeviceDescriptor> = D["chars"];
type CharKey<D extends DeviceDescriptor> = keyof CharsOf<D> & string;
type CharValue<D extends DeviceDescriptor, K extends CharKey<D>> =
	CharsOf<D>[K] extends CharDescriptor<infer T> ? T : never;

export type Adapter<D extends DeviceDescriptor> = {
	descriptor: D;
	read: <K extends CharKey<D>>(charName: K) => Promise<BLEResult<CharValue<D, K>>>;
	write: <K extends CharKey<D>>(charName: K, value: CharValue<D, K>) => Promise<BLEResult>;
	transferFile?: (
		content: Uint8Array,
		meta: TransferMeta,
		onProgress: (pct: number) => void,
	) => Promise<BLEResult>;
};

export function createBleAdapter<D extends DeviceDescriptor>(
	descriptor: D,
	deviceId: string,
): Adapter<D> {
	const read = async <K extends CharKey<D>>(charName: K): Promise<BLEResult<CharValue<D, K>>> => {
		const char = descriptor.chars[charName] as CharDescriptor<CharValue<D, K>> | undefined;
		if (!char) {
			return { success: false, error: `Unknown characteristic: ${charName}` };
		}
		try {
			const view = await BleClient.read(deviceId, descriptor.serviceUuid, char.uuid);
			return { success: true, data: char.codec.decode(view) };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : `Failed to read ${charName}`,
			};
		}
	};

	const write = async <K extends CharKey<D>>(
		charName: K,
		value: CharValue<D, K>,
	): Promise<BLEResult> => {
		const char = descriptor.chars[charName] as CharDescriptor<CharValue<D, K>> | undefined;
		if (!char) {
			return { success: false, error: `Unknown characteristic: ${charName}` };
		}
		try {
			await BleClient.write(deviceId, descriptor.serviceUuid, char.uuid, char.codec.encode(value));
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : `Failed to write ${charName}`,
			};
		}
	};

	const adapter: Adapter<D> = {
		descriptor,
		read,
		write,
	};

	if (descriptor.transfer) {
		const transferImpl = descriptor.transfer;
		adapter.transferFile = (content, meta, onProgress) =>
			transferImpl(deviceId, content, meta, onProgress);
	}

	return adapter;
}
