/**
 * Multi-book library fetch (notify-stream).
 *
 * Wire format (mirrors apps/rsvpnano/src/sync/BleSyncManager.cpp::drainLibraryFetch):
 *   App   → device: any non-empty write to LIBRARY_CHAR_UUID triggers a fetch.
 *   Device → app via NOTIFY, all tag-prefixed:
 *     HDR  [0x01][totalChunks:u16 BE][totalBytes:u32 BE]
 *     DATA [0x02][seq:u16 BE][payload bytes ...]
 *     END  [0x03][crc32:u32 BE]   ← CRC over the concatenated JSON payload
 *     ERR  [0x7F][utf-8 reason]
 *
 * Required because @capacitor-community/bluetooth-le on Android caps a single
 * read at MTU-3 (~514 B); the library JSON exceeds that at ~4 books.
 */

import { BleClient, ConnectionPriority } from "@capacitor-community/bluetooth-le";
import { multibook } from "@lesefluss/ble-config";
import { log } from "../../../utils/log";
import type { BLEResult, LibraryFetchImpl } from "../../ble-transport/types";
import type { MultiBookLibraryEntry } from "./descriptor";

const SERVICE_UUID = multibook.serviceUuid;
const LIBRARY_CHAR_UUID = multibook.characteristics.library.uuid;

const TAG_HDR = 0x01;
const TAG_DATA = 0x02;
const TAG_END = 0x03;
const TAG_ERR = 0x7f;

// Sniff for the documented first-packet-after-subscribe drop in the Capacitor
// BLE plugin (#635). 50 ms wasn't enough on real Android hardware (Pixel-class)
// — the first HDR notify was being dropped, manifesting as "END before HDR".
// 200 ms is still well within "fast refresh" UX and reliably clears the gap
// between startNotifications resolving and the CCCD descriptor actually
// being honored by BluetoothGatt.
const POST_SUBSCRIBE_DELAY_MS = 200;
// Total wall-clock cap covers two cases:
//   (a) typical refresh — stream completes in ≤2 s for a few-KB payload
//   (b) refresh right after an upload that triggers an index rebuild on the
//       device. The rebuild can stall the BLE update() loop for 15-25 s on
//       large books (e.g. 162k-word book indexed in 19 s observed). During
//       that window the device queues the trigger but cannot emit HDR.
// 30 s comfortably covers the slowest observed rebuild while still bounding
// the UI freeze when the device is truly gone. FRAME_GAP_TIMEOUT_MS catches
// the more common case of "device stopped mid-stream" within 1.5 s.
const OVERALL_TIMEOUT_MS = 30_000;
// Per-frame idle limit AFTER HDR arrives. Once the stream is flowing, a
// gap >1.5 s means the device went away mid-stream — fail fast.
const FRAME_GAP_TIMEOUT_MS = 1_500;
// Retry count for CRC mismatches. One retry handles a stray notify drop
// (plugin #424/#635) without masking persistent corruption.
const MAX_ATTEMPTS = 2;
// Hard cap on advertised payload size from HDR. Anything larger is rejected
// before allocation — guards against a corrupt totalBytes (e.g. 0xFFFFFFFF
// from a bit-flipped HDR) triggering a RangeError inside the notify callback
// that would bypass finish() and hang the promise until OVERALL_TIMEOUT_MS.
// 64 KB is ~32× the realistic library JSON size; nothing legitimate hits it.
const MAX_LIBRARY_BYTES = 64 * 1024;

const textDecoder = new TextDecoder("utf-8");

// IEEE 802.3 CRC-32 (polynomial 0xEDB88320, init=0xFFFFFFFF, xorOut=0xFFFFFFFF).
// Matches esp_crc32_le() on the firmware side.
const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xff]! ^ (crc >>> 8)) >>> 0;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

type Hdr = { totalChunks: number; totalBytes: number };

type StreamState =
	| { kind: "awaiting-hdr" }
	| { kind: "collecting"; hdr: Hdr; chunks: Map<number, Uint8Array> }
	| { kind: "done"; payload: Uint8Array }
	| { kind: "error"; reason: string };

async function fetchOnce(deviceId: string): Promise<BLEResult<Uint8Array>> {
	let state: StreamState = { kind: "awaiting-hdr" };
	let lastFrameAt = Date.now();
	let resolveDone: ((res: BLEResult<Uint8Array>) => void) | null = null;
	let overallTimer: ReturnType<typeof setTimeout> | null = null;
	let gapTimer: ReturnType<typeof setInterval> | null = null;
	let subscribed = false;
	// Notify callbacks fire as soon as startNotifications resolves. Without a
	// "stream is live" gate, a retained frame from a prior aborted attempt
	// (capacitor-community/bluetooth-le #635) would mutate `state` before the
	// trigger write fires, leaving the real stream to be merged with stale
	// chunks or rejected as "END before HDR". streamLive flips true only
	// after the trigger write returns, so early stray frames are dropped.
	let streamLive = false;

	const finish = (res: BLEResult<Uint8Array>) => {
		if (overallTimer) {
			clearTimeout(overallTimer);
			overallTimer = null;
		}
		if (gapTimer) {
			clearInterval(gapTimer);
			gapTimer = null;
		}
		if (resolveDone) {
			const r = resolveDone;
			resolveDone = null;
			r(res);
		}
	};

	const onFrame = (view: DataView) => {
		if (!streamLive) {
			// Stale notify from a prior attempt or pre-trigger noise. Drop.
			return;
		}
		lastFrameAt = Date.now();
		if (view.byteLength < 1) {
			return;
		}
		const tag = view.getUint8(0);

		if (tag === TAG_ERR) {
			const reason = textDecoder.decode(
				new Uint8Array(view.buffer, view.byteOffset + 1, view.byteLength - 1),
			);
			state = { kind: "error", reason };
			finish({ success: false, error: `device: ${reason}` });
			return;
		}

		if (tag === TAG_HDR) {
			if (view.byteLength < 1 + 2 + 4) {
				state = { kind: "error", reason: "HDR frame too short" };
				finish({ success: false, error: "HDR frame too short" });
				return;
			}
			const totalChunks = view.getUint16(1, false); // BE
			const totalBytes = view.getUint32(3, false); // BE
			if (totalBytes > MAX_LIBRARY_BYTES) {
				// Reject before allocating. A corrupt HDR with totalBytes ~ 4 GB
				// would otherwise throw RangeError synchronously inside this
				// callback, bypass finish(), and hang until OVERALL_TIMEOUT_MS.
				state = { kind: "error", reason: `totalBytes ${totalBytes} > ${MAX_LIBRARY_BYTES}` };
				finish({
					success: false,
					error: `HDR totalBytes ${totalBytes} exceeds cap ${MAX_LIBRARY_BYTES}`,
				});
				return;
			}
			state = { kind: "collecting", hdr: { totalChunks, totalBytes }, chunks: new Map() };
			// Zero-chunk fast path: device has no books. END follows immediately
			// (and its CRC will be over the empty payload — CRC32("") = 0).
			return;
		}

		if (tag === TAG_DATA) {
			if (state.kind !== "collecting") {
				return; // stray DATA before HDR / after END — ignore
			}
			if (view.byteLength < 1 + 2) {
				return; // malformed
			}
			const seq = view.getUint16(1, false);
			const payloadLen = view.byteLength - 3;
			const payload = new Uint8Array(view.buffer, view.byteOffset + 3, payloadLen);
			// Copy out — the underlying buffer may be reused by the plugin.
			state.chunks.set(seq, new Uint8Array(payload));
			return;
		}

		if (tag === TAG_END) {
			if (state.kind !== "collecting") {
				state = { kind: "error", reason: "END before HDR" };
				finish({ success: false, error: "END before HDR" });
				return;
			}
			if (view.byteLength < 1 + 4) {
				finish({ success: false, error: "END frame too short" });
				return;
			}
			const expectedCrc = view.getUint32(1, false);
			const { hdr, chunks } = state;

			if (chunks.size !== hdr.totalChunks) {
				// Diagnose which seqs landed vs were lost — helps tell plugin
				// drops apart from firmware skips.
				const received = Array.from(chunks.keys()).sort((a, b) => a - b);
				const missing: number[] = [];
				for (let i = 0; i < hdr.totalChunks; i++) {
					if (!chunks.has(i)) missing.push(i);
				}
				finish({
					success: false,
					error: `chunk count mismatch: got ${chunks.size}/${hdr.totalChunks} received=[${received.join(",")}] missing=[${missing.join(",")}]`,
				});
				return;
			}

			// Assemble in seq order.
			const payload = new Uint8Array(hdr.totalBytes);
			let offset = 0;
			for (let i = 0; i < hdr.totalChunks; i++) {
				const c = chunks.get(i);
				if (!c) {
					finish({ success: false, error: `missing chunk seq=${i}` });
					return;
				}
				payload.set(c, offset);
				offset += c.byteLength;
			}
			if (offset !== hdr.totalBytes) {
				finish({
					success: false,
					error: `byte count mismatch: got ${offset} expected ${hdr.totalBytes}`,
				});
				return;
			}

			const actualCrc = crc32(payload);
			if (actualCrc !== expectedCrc) {
				finish({
					success: false,
					error: `crc mismatch: got ${actualCrc.toString(16)} expected ${expectedCrc.toString(16)}`,
				});
				return;
			}

			state = { kind: "done", payload };
			finish({ success: true, data: payload });
			return;
		}

		// Unknown tag — ignore (forward-compat).
	};

	try {
		// Wire the result promise BEFORE subscribing so resolveDone + timers
		// are armed if a notify arrives the instant startNotifications resolves.
		// Frames before streamLive=true are still dropped by the onFrame guard,
		// but having resolveDone set means finish() can short-circuit on an
		// unexpected pre-stream event (e.g. plugin replays an ERR frame from a
		// prior attempt) instead of being silently swallowed.
		const result = new Promise<BLEResult<Uint8Array>>((resolve) => {
			resolveDone = resolve;
			overallTimer = setTimeout(() => {
				finish({
					success: false,
					error: `library fetch timed out after ${OVERALL_TIMEOUT_MS}ms in state=${state.kind}`,
				});
			}, OVERALL_TIMEOUT_MS);
			// Tick a per-frame gap detector after HDR arrives.
			gapTimer = setInterval(() => {
				if (state.kind !== "collecting") {
					return;
				}
				if (Date.now() - lastFrameAt > FRAME_GAP_TIMEOUT_MS) {
					finish({
						success: false,
						error: `frame gap exceeded ${FRAME_GAP_TIMEOUT_MS}ms (got ${
							state.chunks.size
						}/${state.hdr.totalChunks} chunks)`,
					});
				}
			}, 250);
		});

		await BleClient.startNotifications(deviceId, SERVICE_UUID, LIBRARY_CHAR_UUID, (view) =>
			onFrame(view),
		);
		subscribed = true;

		// Plugin first-notify ordering bug (#635): pause before triggering.
		await new Promise((r) => setTimeout(r, POST_SUBSCRIBE_DELAY_MS));

		// Trigger: any non-empty write. Use writeWithoutResponse so the firmware
		// onWrite callback fires immediately without waiting for an ATT ack.
		// Mark the stream live ONLY after the trigger has been dispatched; any
		// earlier notify (#635 retained frames, stale device state) is dropped.
		const trigger = new Uint8Array([0x01]);
		await BleClient.writeWithoutResponse(
			deviceId,
			SERVICE_UUID,
			LIBRARY_CHAR_UUID,
			new DataView(trigger.buffer),
		);
		streamLive = true;
		lastFrameAt = Date.now();

		return await result;
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : `library fetch failed: ${String(err)}`,
		};
	} finally {
		if (subscribed) {
			try {
				await BleClient.stopNotifications(deviceId, SERVICE_UUID, LIBRARY_CHAR_UUID);
			} catch (err) {
				log("library-fetch", "stopNotifications failed:", err);
			}
		}
	}
}

export const fetchMultiBookLibrary: LibraryFetchImpl<MultiBookLibraryEntry[]> = async (
	deviceId,
) => {
	const startedAt = Date.now();
	let lastError = "unknown";

	// Bump connection interval for the fetch so Android schedules BLE events
	// more aggressively — same trick the transfer impl uses to keep packets
	// from being dropped at the plugin layer. Ignored on iOS.
	try {
		await BleClient.requestConnectionPriority(
			deviceId,
			ConnectionPriority.CONNECTION_PRIORITY_HIGH,
		);
	} catch (err) {
		log("library-fetch", "requestConnectionPriority failed (continuing):", err);
	}

	try {
		return await fetchWithRetries();
	} finally {
		try {
			await BleClient.requestConnectionPriority(
				deviceId,
				ConnectionPriority.CONNECTION_PRIORITY_BALANCED,
			);
		} catch (err) {
			log("library-fetch", "restore priority failed:", err);
		}
	}

	async function fetchWithRetries(): Promise<BLEResult<MultiBookLibraryEntry[]>> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const result = await fetchOnce(deviceId);
		if (result.success) {
			const payload = result.data;
			if (!payload) {
				lastError = "empty payload";
				continue;
			}
			try {
				const json = textDecoder.decode(payload);
				const entries = JSON.parse(json) as MultiBookLibraryEntry[];
				log(
					"library-fetch",
					`ok in ${Date.now() - startedAt}ms (${payload.byteLength}B, ${entries.length} entries, attempt ${attempt}/${MAX_ATTEMPTS})`,
				);
				return { success: true, data: entries };
			} catch (err) {
				lastError =
					err instanceof Error ? `JSON parse: ${err.message}` : `JSON parse failed`;
			}
		} else {
			lastError = result.error ?? "unknown";
		}
		log(
			"library-fetch",
			`attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}${
				attempt < MAX_ATTEMPTS ? ", retrying" : ""
			}`,
		);
	}

	return { success: false, error: lastError };
	}
};
