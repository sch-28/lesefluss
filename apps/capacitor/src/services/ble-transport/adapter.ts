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

// Android BluetoothGatt + the Capacitor BLE plugin only support a single
// in-flight GATT operation per connection. Concurrent read/write calls from
// JS (e.g. Promise.all of two reads, or write-then-immediate-read) either
// throw, stall, or freeze the bridge. Serialize every adapter op per-device
// through a tiny promise chain so callers can issue ops freely.
const deviceOpChains = new Map<string, Promise<unknown>>();

function enqueueDeviceOp<T>(deviceId: string, op: () => Promise<T>): Promise<T> {
	const previous = deviceOpChains.get(deviceId) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(op);
	deviceOpChains.set(
		deviceId,
		next.catch(() => undefined),
	);
	return next;
}

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
	const read = <K extends CharKey<D>>(charName: K): Promise<BLEResult<CharValue<D, K>>> =>
		enqueueDeviceOp(deviceId, async () => {
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
		});

	const write = <K extends CharKey<D>>(
		charName: K,
		value: CharValue<D, K>,
	): Promise<BLEResult> =>
		enqueueDeviceOp(deviceId, async () => {
			const char = descriptor.chars[charName] as CharDescriptor<CharValue<D, K>> | undefined;
			if (!char) {
				return { success: false, error: `Unknown characteristic: ${charName}` };
			}
			try {
				await BleClient.write(
					deviceId,
					descriptor.serviceUuid,
					char.uuid,
					char.codec.encode(value),
				);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : `Failed to write ${charName}`,
				};
			}
		});

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
