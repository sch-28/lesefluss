import { Preferences } from "@capacitor/preferences";
import { log } from "../../utils/log";

/**
 * How far this device's clock is from the sync server's, so the stamps sync
 * compares (book positions and metadata, settings) are close to server time even
 * when they are made offline. The server clamps a future stamp to its own now at
 * push time, which makes an old offline edit from a fast clock look newer than
 * what other devices wrote meanwhile.
 *
 * Measured from the pull's `serverTime` field, not the Date header: the native
 * app reaches the server cross-origin, where Date is not a CORS-readable header,
 * and it only has whole seconds.
 */

const KEY = "sync_server_clock_offset";

/** A clock this close to the server's (or within the round trip) stamps with its own time, as before the offset existed. */
export const IN_SYNC_MS = 2_000;
/** A slower pull measures the offset too loosely to trust. */
export const MAX_ROUND_TRIP_MS = 10_000;
/** Further off than this is a broken measurement, not a clock. */
export const MAX_OFFSET_MS = 30 * 24 * 60 * 60_000;

let offsetMs = 0;
let hasMeasured = false;
/** Never stamp below the last stamp issued under the current offset. */
let lastIssued = 0;
/**
 * Wall clock minus monotonic clock when the offset was last confirmed. It drops
 * when the wall clock is set back, as when a fast clock is corrected. It also
 * rises while the device sleeps (the monotonic clock pauses), so a forward
 * correction cannot be told from a sleep.
 */
let wallAnchor = wallMinusMonotonic();

export type ServerTimeSample = { serverTime: number; sentAt: number; receivedAt: number };

function measure(sample: ServerTimeSample): { measured: number; tolerance: number } | null {
	const { serverTime, sentAt, receivedAt } = sample;
	if (![serverTime, sentAt, receivedAt].every(Number.isFinite)) return null;
	const roundTrip = receivedAt - sentAt;
	if (roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return null;
	// The server read its clock somewhere between sending and receiving.
	const measured = Math.round(serverTime - (sentAt + receivedAt) / 2);
	if (Math.abs(measured) > MAX_OFFSET_MS) return null;
	return { measured, tolerance: Math.max(IN_SYNC_MS, roundTrip) };
}

/**
 * The offset to keep after a sample: the current one when the sample is unusable
 * or within its own uncertainty of it, else the new measurement (0 when the
 * clock is within `IN_SYNC_MS` or the round trip).
 */
export function nextServerClockOffset(sample: ServerTimeSample, current: number): number {
	const result = measure(sample);
	if (!result) return current;
	const { measured, tolerance } = result;
	if (Math.abs(measured - current) <= tolerance) return current;
	if (Math.abs(measured) <= tolerance) return 0;
	return measured;
}

export function serverClockOffset(): number {
	dropOffsetIfClockSetBack();
	return offsetMs;
}

/** Now on the server's clock, never below a stamp issued before under the same offset. */
export function serverNow(): number {
	dropOffsetIfClockSetBack();
	const local = Date.now();
	if (offsetMs === 0) return local;
	lastIssued = Math.max(lastIssued, local + offsetMs);
	return lastIssued;
}

export function recordServerTime(sample: ServerTimeSample): void {
	if (!measure(sample)) return;
	hasMeasured = true;
	const next = nextServerClockOffset(sample, offsetMs);
	if (next !== offsetMs) log("sync", `server clock offset ${offsetMs}ms -> ${next}ms`);
	setOffset(next);
	storeOffset(next);
}

/** Restores the offset from the last pull, so a cold start offline still stamps with it. */
export async function loadServerClockOffset(): Promise<void> {
	const { value } = await Preferences.get({ key: KEY });
	// A pull that finished while this was reading has the fresher offset.
	if (hasMeasured || value === null) return;
	const stored = Number(value);
	if (Number.isSafeInteger(stored) && Math.abs(stored) <= MAX_OFFSET_MS) setOffset(stored);
}

function dropOffsetIfClockSetBack(): void {
	const now = wallMinusMonotonic();
	if (offsetMs !== 0 && now < wallAnchor - IN_SYNC_MS) {
		log("sync", `clock set back, server clock offset ${offsetMs}ms -> 0ms until the next pull`);
		setOffset(0);
		storeOffset(0);
	}
	wallAnchor = Math.max(wallAnchor, now);
}

function wallMinusMonotonic(): number {
	return Date.now() - performance.now();
}

function setOffset(next: number): void {
	offsetMs = next;
	lastIssued = 0;
	wallAnchor = wallMinusMonotonic();
}

function storeOffset(value: number): void {
	Preferences.set({ key: KEY, value: String(value) }).catch((err) =>
		log.warn("sync", "could not store the server clock offset:", err),
	);
}

export function _resetForTests(): void {
	setOffset(0);
	hasMeasured = false;
}
