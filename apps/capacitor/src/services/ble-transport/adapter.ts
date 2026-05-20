/**
 * Descriptor → typed adapter factory.
 *
 * Given a DeviceDescriptor, produces an object exposing read/write methods
 * for each declared characteristic plus an optional transferFile method.
 *
 * The returned adapter relies on transportBleClient for the connection
 * lifecycle. Calling read/write before connect throws.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { transportBleClient } from "./client";
import type {
	BLEResult,
	CharDescriptor,
	DeviceDescriptor,
	TransferMeta,
} from "./types";

type CharsOf<D extends DeviceDescriptor> = D["chars"];
type CharKey<D extends DeviceDescriptor> = keyof CharsOf<D> & string;
type CharValue<D extends DeviceDescriptor, K extends CharKey<D>> = CharsOf<D>[K] extends
	CharDescriptor<infer T>
	? T
	: never;

export type Adapter<D extends DeviceDescriptor> = {
	descriptor: D;
	read: <K extends CharKey<D>>(charName: K) => Promise<BLEResult<CharValue<D, K>>>;
	write: <K extends CharKey<D>>(
		charName: K,
		value: CharValue<D, K>,
	) => Promise<BLEResult>;
	transferFile?: (
		content: Uint8Array,
		meta: TransferMeta,
		onProgress: (pct: number) => void,
	) => Promise<BLEResult>;
};

export function createBleAdapter<D extends DeviceDescriptor>(descriptor: D): Adapter<D> {
	const read = async <K extends CharKey<D>>(charName: K): Promise<BLEResult<CharValue<D, K>>> => {
		const char = descriptor.chars[charName] as CharDescriptor<CharValue<D, K>> | undefined;
		if (!char) {
			return { success: false, error: `Unknown characteristic: ${charName}` };
		}
		try {
			const device = transportBleClient.assertConnected();
			const view = await BleClient.read(device.deviceId, descriptor.serviceUuid, char.uuid);
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
			const device = transportBleClient.assertConnected();
			await BleClient.write(
				device.deviceId,
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
	};

	const adapter: Adapter<D> = {
		descriptor,
		read,
		write,
	};

	if (descriptor.transfer) {
		const transferImpl = descriptor.transfer;
		adapter.transferFile = (content, meta, onProgress) => {
			try {
				const device = transportBleClient.assertConnected();
				return transferImpl(device.deviceId, content, meta, onProgress);
			} catch (error) {
				return Promise.resolve({
					success: false,
					error: error instanceof Error ? error.message : "Not connected",
				});
			}
		};
	}

	return adapter;
}
