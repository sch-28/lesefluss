/**
 * File transfer characteristic — chunked book upload with sliding-window pipelining.
 * Characteristic 2: Write + Notify
 *
 * Protocol:
 *   App writes:   START:<total_bytes>:<filename>
 *   Device notif: ACK:START  |  NACK:<reason>
 *
 *   App writes:   CHUNK:<seq_4digit>:<base64_data>   (up to WINDOW_SIZE in flight)
 *   Device notif: ACK:<seq>  |  NACK:<seq>:<reason>
 *
 *   App writes:   END:<crc32_hex>
 *   Device notif: ACK:END  |  NACK:END:<reason>
 *
 * Pipelining: the app sends up to WINDOW_SIZE chunks ahead of the ACK stream.
 * The ESP32 processes writes from its BLE IRQ queue in order and ACKs each one.
 * As ACKs arrive the window slides forward. This cuts idle time from ~1 round-trip
 * per chunk down to ~1 round-trip per window, giving roughly WINDOW_SIZE× speedup.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import {
	ACK_TIMEOUT_MS,
	CHUNK_SIZE,
	FILE_TRANSFER_CHAR_UUID,
	SERVICE_UUID,
	WINDOW_SIZE,
} from "@rsvp/ble-config";
import CRC32 from "crc-32";
import { log } from "../../../utils/log";
import { bleClient } from "../client";
import type { BLEResult } from "../types";
import { chunkBytes, dataViewToString, stringToDataView, uint8ToBase64 } from "../utils/encoding";

/**
 * Transfer a book's plain-text content to the ESP32.
 *
 * @param content     Full plain text of the book
 * @param filename    Book ID for the START frame (8-char hex, saved as book.hash on device)
 * @param onProgress  Called with 0–100 as chunks are acknowledged
 * @param title       Human-readable book title (synced to device for home-screen display)
 */
export async function transferBook(
	content: string,
	filename: string,
	onProgress: (pct: number) => void,
	title?: string,
): Promise<BLEResult> {
	const device = bleClient.assertConnected();
	const deviceId = device.deviceId;

	// Encode full content to UTF-8 bytes once
	const utf8Bytes = new TextEncoder().encode(content);
	const chunks = chunkBytes(utf8Bytes, CHUNK_SIZE);
	const totalBytes = utf8Bytes.length;
	const totalChunks = chunks.length;

	log(
		"transfer",
		`starting — ${totalBytes} bytes, ${totalChunks} chunks, filename=${filename}, title=${JSON.stringify(title)}`,
	);

	// Subscribe to notifications before sending anything.
	// A short delay after subscribing ensures the ESP32's BLE stack has fully
	// registered the CCCD before we send the first write — without this,
	// the ACK:START notification can be sent by the device but never delivered.
	const ackQueue = createAckQueue();
	const notifyResult = await setupNotifications(deviceId, ackQueue);
	if (!notifyResult.success) return notifyResult;
	await new Promise((r) => setTimeout(r, 200));

	// Build START frame: START:<bytes>:<id>[:<title>]
	// Title colons stripped for protocol, non-ASCII stripped because
	// MicroPython on ESP32-S3 crashes on strings with chars above U+00FF.
	const safeTitle = title
		? title
				.replace(/:/g, " ")
				.replace(/[^\x20-\x7E]/g, "")
				.trim()
		: "";
	const startFrame = safeTitle
		? `START:${totalBytes}:${filename}:${safeTitle}`
		: `START:${totalBytes}:${filename}`;

	const startFrameBytes = new TextEncoder().encode(startFrame).length;
	log("transfer", `START frame: ${startFrameBytes} bytes — "${startFrame}"`);

	try {
		// ── START (strict request/response) ──
		const startResult = await writeAndWaitAck(deviceId, startFrame, "START", ackQueue);
		if (!startResult.success) return startResult;

		// ── CHUNKs (sliding window) ──
		const chunkResult = await sendChunksWindowed(
			deviceId,
			chunks,
			totalChunks,
			onProgress,
			ackQueue,
		);
		if (!chunkResult.success) return chunkResult;

		// ── END (strict request/response) ──
		const crcHex = (CRC32.buf(utf8Bytes) >>> 0).toString(16);
		const endResult = await writeAndWaitAck(deviceId, `END:${crcHex}`, "END", ackQueue);
		if (!endResult.success) return endResult;

		return { success: true };
	} finally {
		ackQueue.dispose();
		try {
			await BleClient.stopNotifications(deviceId, SERVICE_UUID, FILE_TRANSFER_CHAR_UUID);
		} catch {
			// best-effort cleanup
		}
	}
}

// ---------------------------------------------------------------------------
// ACK queue — decouples notification arrival from the send loop
// ---------------------------------------------------------------------------

interface AckQueue {
	/** Returns the next notification message. Rejects on timeout or disposal. */
	waitNext: () => Promise<string>;
	/** Called by the notification handler to push a message into the queue. */
	push: (msg: string) => void;
	/** Clean up pending waiters. */
	dispose: () => void;
}

function createAckQueue(): AckQueue {
	// Incoming messages that arrived before anyone called waitNext()
	const buffer: string[] = [];
	// Pending waiters (resolve/reject) from waitNext() calls
	const waiters: { resolve: (msg: string) => void; reject: (err: Error) => void }[] = [];
	let disposed = false;

	return {
		push(msg: string) {
			const waiter = waiters.shift();
			if (waiter) {
				// Someone is already waiting — deliver immediately
				waiter.resolve(msg);
			} else {
				buffer.push(msg);
			}
		},

		waitNext(): Promise<string> {
			if (disposed) return Promise.reject(new Error("AckQueue disposed"));

			// If there's already a buffered message, return it immediately
			const buffered = buffer.shift();
			if (buffered !== undefined) {
				return Promise.resolve(buffered);
			}

			// Otherwise park until push() delivers one, or timeout
			return new Promise<string>((resolve, reject) => {
				let settled = false;

				const timer = setTimeout(() => {
					if (settled) return;
					settled = true;
					const idx = waiters.indexOf(waiter);
					if (idx >= 0) waiters.splice(idx, 1);
					reject(new Error("ACK timeout"));
				}, ACK_TIMEOUT_MS);

				const waiter = {
					resolve: (msg: string) => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						resolve(msg);
					},
					reject,
				};
				waiters.push(waiter);
			});
		},

		dispose() {
			disposed = true;
			for (const w of waiters) {
				w.reject(new Error("AckQueue disposed"));
			}
			waiters.length = 0;
			buffer.length = 0;
		},
	};
}

// ---------------------------------------------------------------------------
// Notification subscription
// ---------------------------------------------------------------------------

async function setupNotifications(deviceId: string, ackQueue: AckQueue): Promise<BLEResult> {
	try {
		await BleClient.startNotifications(deviceId, SERVICE_UUID, FILE_TRANSFER_CHAR_UUID, (value) => {
			const msg = dataViewToString(value);
			log("transfer", `notification received: "${msg}"`);
			ackQueue.push(msg);
		});
		log("transfer", "notifications subscribed");
		return { success: true };
	} catch (error) {
		log.error("transfer", "failed to subscribe to notifications:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to subscribe to notifications",
		};
	}
}

// ---------------------------------------------------------------------------
// Strict request/response (used for START and END)
// Uses write-with-response for ATT-level delivery guarantee on control frames.
// ---------------------------------------------------------------------------

async function writeAndWaitAck(
	deviceId: string,
	frame: string,
	expectedToken: string,
	ackQueue: AckQueue,
): Promise<BLEResult> {
	const frameBytes = new TextEncoder().encode(frame).length;
	log(
		"transfer",
		`write ${expectedToken} (${frameBytes} bytes), waiting for ACK:${expectedToken}…`,
	);
	try {
		await BleClient.writeWithoutResponse(
			deviceId,
			SERVICE_UUID,
			FILE_TRANSFER_CHAR_UUID,
			stringToDataView(frame),
		);
		log("transfer", `write ${expectedToken} sent OK`);
	} catch (err) {
		log.error("transfer", `write ${expectedToken} failed:`, err);
		return { success: false, error: err instanceof Error ? err.message : "Write failed" };
	}

	try {
		const msg = await ackQueue.waitNext();
		log("transfer", `ACK received for ${expectedToken}: "${msg}"`);
		if (msg === `ACK:${expectedToken}`) return { success: true };
		return { success: false, error: `Expected ACK:${expectedToken}, got: ${msg}` };
	} catch {
		log.error("transfer", `timeout waiting for ACK:${expectedToken} (${ACK_TIMEOUT_MS}ms)`);
		return { success: false, error: `Timeout waiting for ACK:${expectedToken}` };
	}
}

// ---------------------------------------------------------------------------
// Sliding-window chunk sender
// ---------------------------------------------------------------------------

async function sendChunksWindowed(
	deviceId: string,
	chunks: Uint8Array[],
	totalChunks: number,
	onProgress: (pct: number) => void,
	ackQueue: AckQueue,
): Promise<BLEResult> {
	let nextSend = 0; // next chunk index to write
	let nextAck = 0; // next chunk index we expect an ACK for

	/**
	 * Fire off one chunk write (does NOT wait for ACK).
	 * Returns a BLEResult only if the write itself fails.
	 */
	const fireChunk = async (i: number): Promise<BLEResult | null> => {
		const seq = String(i).padStart(4, "0");
		const b64 = uint8ToBase64(chunks[i]);
		try {
			await BleClient.writeWithoutResponse(
				deviceId,
				SERVICE_UUID,
				FILE_TRANSFER_CHAR_UUID,
				stringToDataView(`CHUNK:${seq}:${b64}`),
			);
			return null; // write succeeded — ACK will come later
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : "Write failed" };
		}
	};

	// Fill the initial window
	while (nextSend < totalChunks && nextSend - nextAck < WINDOW_SIZE) {
		const err = await fireChunk(nextSend);
		if (err) return err;
		nextSend++;
	}

	// Drain ACKs, sliding the window forward
	while (nextAck < totalChunks) {
		const expectedSeq = String(nextAck).padStart(4, "0");

		let msg: string;
		try {
			msg = await ackQueue.waitNext();
		} catch {
			return { success: false, error: `Timeout waiting for ACK:${expectedSeq}` };
		}

		if (msg !== `ACK:${expectedSeq}`) {
			return { success: false, error: `Expected ACK:${expectedSeq}, got: ${msg}` };
		}

		nextAck++;
		onProgress(Math.round((nextAck / totalChunks) * 100));

		// Window slid — send the next chunk if available
		if (nextSend < totalChunks) {
			const err = await fireChunk(nextSend);
			if (err) return err;
			nextSend++;
		}
	}

	return { success: true };
}
