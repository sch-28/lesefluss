/**
 * Multi-book transfer protocol.
 *
 * Wire format:
 *   First write:  JSON header `{filename, category, sizeBytes}` (UTF-8 bytes)
 *   Body writes:  raw chunk bytes, up to descriptor.transfer.chunkSize each
 *   Notify:       device emits "ACK:START" after header parses, then
 *                 "ACK:END" once bytesReceived >= sizeBytes, or
 *                 "NACK:<phase>:<reason>" on failure.
 *
 * The firmware (apps/rsvpnano/src/sync/BleSyncManager.cpp) drives the state;
 * the app waits for ACK:START before sending body chunks and ACK:END before
 * resolving the promise.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { multibook } from "@lesefluss/ble-config";
import { log } from "../../../utils/log";
import type { BLEResult, TransferImpl } from "../../ble-transport/types";

const TRANSFER_CHAR_UUID = multibook.characteristics.transfer.uuid;
const SERVICE_UUID = multibook.serviceUuid;
const CHUNK_SIZE = multibook.transfer.chunkSize;
const ACK_TIMEOUT_MS = multibook.transfer.ackTimeoutMs;

const decoder = new TextDecoder("utf-8");

type AckMessage = "ACK:START" | "ACK:END" | { nack: string };

export const transferMultiBook: TransferImpl = async (
	deviceId,
	content,
	meta,
	onProgress,
): Promise<BLEResult> => {
	const filename = meta.filename;
	const category = meta.category ?? "book";
	const sizeBytes = content.byteLength;

	let resolveAck: ((msg: AckMessage) => void) | null = null;
	let lastAck: AckMessage | null = null;

	const waitForAck = (expected: "ACK:START" | "ACK:END"): Promise<BLEResult> =>
		new Promise((resolve) => {
			const timer = setTimeout(() => {
				resolveAck = null;
				resolve({ success: false, error: `Timed out waiting for ${expected}` });
			}, ACK_TIMEOUT_MS);

			const settle = (msg: AckMessage) => {
				clearTimeout(timer);
				resolveAck = null;
				if (msg === expected) {
					resolve({ success: true });
				} else if (typeof msg === "object" && "nack" in msg) {
					resolve({ success: false, error: msg.nack });
				} else {
					resolve({ success: false, error: `Unexpected ack: ${String(msg)}` });
				}
			};

			if (lastAck !== null) {
				const buffered = lastAck;
				lastAck = null;
				settle(buffered);
				return;
			}
			resolveAck = settle;
		});

	try {
		await BleClient.startNotifications(deviceId, SERVICE_UUID, TRANSFER_CHAR_UUID, (view) => {
			const msg = decoder.decode(view).replace(/\0+$/, "");
			log("multibook-transfer", "ack:", msg);
			const parsed: AckMessage =
				msg === "ACK:START" || msg === "ACK:END" ? msg : { nack: msg };
			if (resolveAck) {
				resolveAck(parsed);
			} else {
				lastAck = parsed;
			}
		});

		await new Promise((r) => setTimeout(r, 100));

		const header = JSON.stringify({ filename, category, sizeBytes });
		const headerBytes = new TextEncoder().encode(header);
		await BleClient.write(
			deviceId,
			SERVICE_UUID,
			TRANSFER_CHAR_UUID,
			new DataView(headerBytes.buffer),
		);

		const startAck = await waitForAck("ACK:START");
		if (!startAck.success) {
			return startAck;
		}

		let offset = 0;
		while (offset < sizeBytes) {
			const end = Math.min(offset + CHUNK_SIZE, sizeBytes);
			const slice = content.subarray(offset, end);
			await BleClient.write(
				deviceId,
				SERVICE_UUID,
				TRANSFER_CHAR_UUID,
				new DataView(slice.buffer, slice.byteOffset, slice.byteLength),
			);
			offset = end;
			onProgress(Math.round((offset / sizeBytes) * 100));
		}

		const endAck = await waitForAck("ACK:END");
		if (!endAck.success) {
			return endAck;
		}

		return { success: true };
	} finally {
		try {
			await BleClient.stopNotifications(deviceId, SERVICE_UUID, TRANSFER_CHAR_UUID);
		} catch {}
	}
};
