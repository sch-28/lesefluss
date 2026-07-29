import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildJourney } from "../journey";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "Europe/Berlin";
});
afterAll(() => {
	process.env.TZ = ORIGINAL_TZ;
});

function at(y: number, m: number, d: number, h = 12): number {
	return new Date(y, m - 1, d, h).getTime();
}

describe("buildJourney", () => {
	it("shows only what happened for a book that was never opened", () => {
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: null,
			firstReadAt: null,
			lastReadAt: null,
		});
		expect(j.milestones.map((m) => m.label)).toEqual(["Added"]);
		expect(j.spanDays).toBeNull();
		expect(j.isFinished).toBe(false);
	});

	it("counts both end days, so a book read in one sitting spans one day", () => {
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: null,
			firstReadAt: at(2026, 5, 3, 9),
			lastReadAt: at(2026, 5, 3, 22),
		});
		expect(j.spanDays).toBe(1);
	});

	it("spans first to last local day inclusive", () => {
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: null,
			firstReadAt: at(2026, 5, 3),
			lastReadAt: at(2026, 5, 10),
		});
		expect(j.spanDays).toBe(8);
	});

	// `finishedAt` is never cleared, so a reopened book keeps drifting its last
	// read. Measuring to the finish keeps "took 8 days" from becoming "took 90".
	it("measures to the finish, not to a later reopen", () => {
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: at(2026, 5, 10),
			firstReadAt: at(2026, 5, 3),
			lastReadAt: at(2026, 7, 20),
		});
		expect(j.spanDays).toBe(8);
		expect(j.milestones.map((m) => m.label)).toEqual(["Added", "Started", "Finished"]);
		expect(j.isFinished).toBe(true);
	});

	it("does not repeat a single sitting as both start and last read", () => {
		const only = at(2026, 5, 3);
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: null,
			firstReadAt: only,
			lastReadAt: only,
		});
		expect(j.milestones.map((m) => m.label)).toEqual(["Added", "Started"]);
	});

	// backfillFinishedAt stamps `finishedAt = COALESCE(lastRead, addedAt)`, so a
	// library restored from the server can carry a finish older than any local
	// session. Measuring to it reported a week of reading as a single day.
	it("ignores a finish stamped before the first sitting", () => {
		const j = buildJourney({
			addedAt: at(2026, 3, 1),
			finishedAt: at(2026, 3, 1),
			firstReadAt: at(2026, 5, 30),
			lastReadAt: at(2026, 6, 6),
		});
		expect(j.spanDays).toBe(8);
	});

	it("orders milestones by time, never by label", () => {
		const j = buildJourney({
			addedAt: at(2026, 3, 1),
			finishedAt: at(2026, 3, 1),
			firstReadAt: at(2026, 5, 30),
			lastReadAt: at(2026, 6, 6),
		});
		const times = j.milestones.map((m) => m.at);
		expect([...times].sort((a, b) => a - b)).toEqual(times);
	});

	it("never reports a negative or zero span", () => {
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: null,
			firstReadAt: at(2026, 5, 10),
			lastReadAt: at(2026, 5, 3),
		});
		expect(j.spanDays).toBe(1);
	});

	it("shows last read for a book still in progress", () => {
		const j = buildJourney({
			addedAt: at(2026, 5, 1),
			finishedAt: null,
			firstReadAt: at(2026, 5, 3),
			lastReadAt: at(2026, 5, 9),
		});
		expect(j.milestones.map((m) => m.label)).toEqual(["Added", "Started", "Last read"]);
	});
});
