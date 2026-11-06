import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preferenceStore = new Map<string, string>();
vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: preferenceStore.get(key) ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			preferenceStore.set(key, value);
		}),
	},
}));

const {
	_resetForTests,
	IN_SYNC_MS,
	loadServerClockOffset,
	MAX_OFFSET_MS,
	MAX_ROUND_TRIP_MS,
	nextServerClockOffset,
	recordServerTime,
	serverClockOffset,
	serverNow,
} = await import("../server-clock");

const HOUR = 60 * 60_000;
const SERVER = Date.UTC(2026, 10, 6, 10);

/** A sample from a clock `ahead` of the server's, answered after `roundTrip` ms. */
function sample(ahead: number, roundTrip = 200) {
	const midpoint = SERVER + ahead;
	return {
		serverTime: SERVER,
		sentAt: midpoint - roundTrip / 2,
		receivedAt: midpoint + roundTrip / 2,
	};
}

beforeEach(() => {
	preferenceStore.clear();
	_resetForTests();
	vi.useFakeTimers({ toFake: ["Date", "performance"] });
	vi.setSystemTime(SERVER + HOUR);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("nextServerClockOffset", () => {
	it("measures a clock running ahead", () => {
		expect(nextServerClockOffset(sample(HOUR), 0)).toBe(-HOUR);
	});

	it("measures a clock running behind", () => {
		expect(nextServerClockOffset(sample(-HOUR), 0)).toBe(HOUR);
	});

	it("takes a clock within the round trip or a couple of seconds as correct", () => {
		expect(nextServerClockOffset(sample(IN_SYNC_MS), 0)).toBe(0);
		expect(nextServerClockOffset(sample(4_000, 5_000), 0)).toBe(0);
		expect(nextServerClockOffset(sample(IN_SYNC_MS), -HOUR)).toBe(0);
	});

	it("ignores a pull too slow to measure by", () => {
		expect(nextServerClockOffset(sample(HOUR, MAX_ROUND_TRIP_MS + 1), 0)).toBe(0);
	});

	it("ignores an absurd measurement", () => {
		expect(nextServerClockOffset(sample(MAX_OFFSET_MS + HOUR), -HOUR)).toBe(-HOUR);
		expect(nextServerClockOffset({ ...sample(HOUR), serverTime: Number.NaN }, 0)).toBe(0);
		expect(nextServerClockOffset({ ...sample(HOUR), receivedAt: SERVER }, 0)).toBe(0);
	});

	it("keeps the offset when a new sample is within its own uncertainty of it", () => {
		expect(nextServerClockOffset(sample(HOUR + 1_500), -HOUR)).toBe(-HOUR);
		expect(nextServerClockOffset(sample(9_000, 9_500), -9_000)).toBe(-9_000);
		expect(nextServerClockOffset(sample(2 * HOUR), -HOUR)).toBe(-2 * HOUR);
	});
});

describe("serverNow", () => {
	it("is the local clock until an offset is measured", () => {
		expect(serverNow()).toBe(Date.now());
	});

	it("is corrected by the measured offset", () => {
		recordServerTime(sample(HOUR));
		expect(serverNow()).toBe(SERVER);
	});

	it("never goes back under the same offset, even when the local clock does", () => {
		recordServerTime(sample(HOUR));
		const first = serverNow();
		vi.setSystemTime(Date.now() - 1_000);
		expect(serverNow()).toBe(first);
	});

	it("goes back to the local clock when the clock is set back, until the next pull", async () => {
		recordServerTime(sample(HOUR));
		await vi.waitFor(() => expect(preferenceStore.size).toBe(1));
		vi.setSystemTime(Date.now() - HOUR);

		expect(serverNow()).toBe(Date.now());
		expect(serverClockOffset()).toBe(0);
		await vi.waitFor(() => expect(preferenceStore.get("sync_server_clock_offset")).toBe("0"));
	});

	it("keeps the offset when the clock moves ahead, as it does over a sleep", () => {
		recordServerTime(sample(HOUR));
		vi.setSystemTime(Date.now() + HOUR);
		expect(serverNow()).toBe(SERVER + HOUR);
	});
});

describe("the stored offset", () => {
	it("survives a restart", async () => {
		recordServerTime(sample(HOUR));
		await vi.waitFor(() => expect(preferenceStore.size).toBe(1));
		_resetForTests();

		await loadServerClockOffset();

		expect(serverClockOffset()).toBe(-HOUR);
	});

	it("loses to a pull that measured while it was loading", async () => {
		preferenceStore.set("sync_server_clock_offset", String(-2 * HOUR));
		const loading = loadServerClockOffset();
		recordServerTime(sample(HOUR));
		await loading;
		expect(serverClockOffset()).toBe(-HOUR);
	});

	it("is overwritten by a pull that measures a correct clock", async () => {
		preferenceStore.set("sync_server_clock_offset", String(-HOUR));
		recordServerTime(sample(0));
		await vi.waitFor(() => expect(preferenceStore.get("sync_server_clock_offset")).toBe("0"));
	});

	it("is ignored when unreadable", async () => {
		preferenceStore.set("sync_server_clock_offset", "soon");
		await loadServerClockOffset();
		expect(serverClockOffset()).toBe(0);
	});
});
