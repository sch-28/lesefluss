/**
 * Multi-book transfer protocol.
 *
 * Wire format:
 *   First write:  JSON header `{filename, category, sizeBytes}` (UTF-8 bytes,
 *                 write-with-response so the START ACK is reliable).
 *   Body writes:  raw chunk bytes up to descriptor.transfer.chunkSize each,
 *                 write-without-response for throughput. Yields every
 *                 `YIELD_EVERY_N_CHUNKS` writes so the Capacitor bridge can
 *                 drain its queue and the firmware-side NimBLE buffers
 *                 don't overflow.
 *   Notify:       device emits "ACK:START" after header parses, "ACK:END"
 *                 once bytesReceived >= sizeBytes, or "NACK:<phase>:<reason>"
 *                 on failure.
 */

import { BleClient, ConnectionPriority } from "@capacitor-community/bluetooth-le";
import { multibook } from "@lesefluss/ble-config";
import { log } from "../../../utils/log";
import type { BLEResult, TransferImpl } from "../../ble-transport/types";

const TRANSFER_CHAR_UUID = multibook.characteristics.transfer.uuid;
const SERVICE_UUID = multibook.serviceUuid;
const CHUNK_SIZE = multibook.transfer.chunkSize;
const ACK_TIMEOUT_MS = multibook.transfer.ackTimeoutMs;

// Higher = faster throughput but more pressure on the firmware-side NimBLE
// host-task buffer (`pendingBytes` vector in BleSyncManager). 16 chunks of
// 509 bytes = ~8KB in-flight before the JS loop yields. ESP32-S3 with default
// NimBLE config tolerates this comfortably.
const YIELD_EVERY_N_CHUNKS = 16;

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

	const waitForAck = (
		expected: "ACK:START" | "ACK:END",
		timeoutMs: number,
	): Promise<BLEResult> =>
		new Promise((resolve) => {
			const timer = setTimeout(() => {
				resolveAck = null;
				resolve({ success: false, error: `Timed out waiting for ${expected}` });
			}, timeoutMs);

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

	// ACK:END fires after the firmware has drained every queued chunk to SD and
	// closed the file. With writeWithoutResponse, the app finishes pumping
	// chunks while the BLE stack is still draining them over the air, so the
	// end ACK lands seconds-to-minutes later for large books. Scale the
	// timeout with size: 5s base + 30ms per KB shipped (≈30 KB/s pessimistic
	// drain rate), capped at 5 min for sanity.
	const endAckTimeoutMs = Math.min(
		5 * 60 * 1000,
		ACK_TIMEOUT_MS + Math.ceil(sizeBytes / 1024) * 30,
	);

	// Request a high-priority connection so write-without-response body chunks
	// ride the fast path. Ignored on iOS (Android-only API); restored to
	// balanced in the finally block so we don't keep the radio hot afterwards.
	try {
		await BleClient.requestConnectionPriority(
			deviceId,
			ConnectionPriority.CONNECTION_PRIORITY_HIGH,
		);
	} catch (err) {
		log("multibook-transfer", "requestConnectionPriority failed (continuing):", err);
	}

	try {
		await BleClient.startNotifications(deviceId, SERVICE_UUID, TRANSFER_CHAR_UUID, (view) => {
			const msg = decoder.decode(view).replace(/\0+$/, "");
			log("multibook-transfer", "ack:", msg);
			const parsed: AckMessage = msg === "ACK:START" || msg === "ACK:END" ? msg : { nack: msg };
			if (resolveAck) {
				resolveAck(parsed);
			} else {
				lastAck = parsed;
			}
		});

		await new Promise((r) => setTimeout(r, 100));

		// Header goes with-response so we can rely on the START ACK arriving
		// after a clean parse on the firmware side.
		const header = JSON.stringify({ filename, category, sizeBytes });
		const headerBytes = new TextEncoder().encode(header);
		await BleClient.write(
			deviceId,
			SERVICE_UUID,
			TRANSFER_CHAR_UUID,
			new DataView(headerBytes.buffer),
		);

		const startAck = await waitForAck("ACK:START", ACK_TIMEOUT_MS);
		if (!startAck.success) {
			return startAck;
		}

		const transferStartedAtMs = Date.now();
		let offset = 0;
		let chunksSinceYield = 0;
		let lastReportedPct = -1;
		while (offset < sizeBytes) {
			const end = Math.min(offset + CHUNK_SIZE, sizeBytes);
			const slice = content.subarray(offset, end);
			await BleClient.writeWithoutResponse(
				deviceId,
				SERVICE_UUID,
				TRANSFER_CHAR_UUID,
				new DataView(slice.buffer, slice.byteOffset, slice.byteLength),
			);
			offset = end;
			// Cap at 95% during the pump phase. With writeWithoutResponse the app
			// hands chunks to Android's BLE queue and returns immediately, so
			// reaching 100% here would lie about delivery — the last ~5% covers
			// queue drain + firmware SD flush + ACK:END, which can take seconds
			// to minutes for large books. The final 100% is reported after the
			// ACK lands.
			const pct = Math.min(95, Math.round((offset / sizeBytes) * 95));
			if (pct !== lastReportedPct) {
				lastReportedPct = pct;
				onProgress(pct);
			}
			chunksSinceYield++;
			if (chunksSinceYield >= YIELD_EVERY_N_CHUNKS) {
				chunksSinceYield = 0;
				await new Promise((r) => setTimeout(r, 0));
			}
		}
		const elapsedMs = Date.now() - transferStartedAtMs;
		if (sizeBytes >= 32 * 1024) {
			const kbps = sizeBytes / 1024 / (elapsedMs / 1000);
			log(
				"multibook-transfer",
				`body sent: ${sizeBytes}B in ${elapsedMs}ms (${kbps.toFixed(1)} KB/s)`,
			);
		}

		const endAck = await waitForAck("ACK:END", endAckTimeoutMs);
		if (!endAck.success) {
			return endAck;
		}

		onProgress(100);
		return { success: true };
	} finally {
		try {
			await BleClient.stopNotifications(deviceId, SERVICE_UUID, TRANSFER_CHAR_UUID);
		} catch (err) {
			log("multibook-transfer", "stopNotifications failed:", err);
		}
		try {
			await BleClient.requestConnectionPriority(
				deviceId,
				ConnectionPriority.CONNECTION_PRIORITY_BALANCED,
			);
		} catch (err) {
			log("multibook-transfer", "restore priority failed:", err);
		}
	}
};
