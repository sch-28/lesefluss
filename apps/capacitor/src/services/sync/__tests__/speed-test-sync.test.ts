import { SPEED_TESTS_PUSH_MAX } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { SpeedTestRow } from "../../db/schema";
import { buildSpeedTestMerge, pushableSpeedTests, speedTestToSync } from "../speed-test-sync";

const row = (id: string, updatedAt: number, readingWpm = 260): SpeedTestRow => ({
	id,
	readingWpm,
	rsvpWpm: 380,
	passageId: "canal-1",
	createdAt: updatedAt,
	updatedAt,
});

describe("buildSpeedTestMerge", () => {
	it("takes a newer server row and keeps a newer local one", () => {
		const local = [row("a", 100), row("b", 300)];
		const server = [
			speedTestToSync(row("a", 200, 280)),
			speedTestToSync(row("b", 200, 999)),
			speedTestToSync(row("c", 50)),
		];
		const merge = buildSpeedTestMerge(local, server);
		expect(merge.upserts.map((r) => [r.id, r.readingWpm])).toEqual([
			["a", 280],
			["c", 260],
		]);
		expect(merge.deletes).toEqual([]);
	});

	it("deletes on a server tombstone whatever the local stamp", () => {
		const tombstone = { ...speedTestToSync(row("a", 10)), deleted: true };
		const merge = buildSpeedTestMerge([row("a", 500)], [tombstone, { ...tombstone, testId: "x" }]);
		expect(merge.deletes).toEqual(["a"]);
		expect(merge.upserts).toEqual([]);
	});

	it("rejects a malformed row instead of applying it", () => {
		const bad = { ...speedTestToSync(row("a", 10)), readingWpm: -5 };
		const merge = buildSpeedTestMerge([], [bad, { nonsense: true }]);
		expect(merge).toEqual({ upserts: [], deletes: [], rejected: 2 });
	});
});

describe("pushableSpeedTests", () => {
	it("holds back a row the server would refuse", () => {
		const { speedTests, rejected } = pushableSpeedTests([row("a", 10), row("b", 20, 0)]);
		expect(speedTests.map((t) => t.testId)).toEqual(["a"]);
		expect(rejected).toBe(1);
	});

	it("sends the newest rows up to the cap", () => {
		const many = Array.from({ length: SPEED_TESTS_PUSH_MAX + 2 }, (_, i) => row(`t${i}`, i + 1));
		const { speedTests } = pushableSpeedTests(many);
		expect(speedTests).toHaveLength(SPEED_TESTS_PUSH_MAX);
		expect(speedTests.map((t) => t.testId)).not.toContain("t0");
	});
});
