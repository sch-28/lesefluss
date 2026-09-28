import { LIVE_IDLE_MS, MAX_PLAUSIBLE_WPM, SANE_WPM_CEILING } from "@lesefluss/core";
import { describe, expect, test } from "vitest";
import { LiveBoard } from "./live-board";

const READ = "read-1";
const T0 = 1_000_000;
const SEC = 1000;

function board() {
	const changes: string[] = [];
	return { board: new LiveBoard((id) => changes.push(id)), changes };
}

/** Reports every 2 s for `seconds`, moving `wpm` words a minute. */
function readAt(
	b: LiveBoard,
	user: string,
	opts: { from?: number; seconds: number; wpm: number; mode?: "rsvp" | "scroll"; dial?: number },
) {
	let pos = opts.from ?? 0;
	for (let t = 0; t <= opts.seconds; t += 2) {
		b.report(
			READ,
			user,
			{ position: Math.round(pos), mode: opts.mode ?? "scroll", dialWpm: opts.dial ?? null },
			10_000,
			T0 + t * SEC,
		);
		pos += (opts.wpm * 2) / 60;
	}
	return T0 + opts.seconds * SEC;
}

describe("live board", () => {
	test("shows an honest reader's speed once the sitting has run long enough", () => {
		const { board: b } = board();
		b.report(READ, "ann", { position: 0, mode: "scroll", dialWpm: null }, 10_000, T0);
		expect(b.members(READ, T0 + 5 * SEC)[0]?.wpm).toBeNull();
		const end = readAt(b, "ann", { seconds: 60, wpm: 250 });
		const [ann] = b.members(READ, end);
		expect(ann?.wpm).toBeGreaterThan(200);
		expect(ann?.wpm).toBeLessThanOrEqual(250);
		expect(ann?.wordPosition).toBeGreaterThan(200);
	});

	test("a jump, a backward move or a forged dial cannot show more than the cap", () => {
		const { board: b } = board();
		b.report(READ, "ann", { position: 0, mode: "scroll", dialWpm: null }, 10_000, T0);
		b.report(READ, "ann", { position: 9_000, mode: "scroll", dialWpm: null }, 10_000, T0 + 2 * SEC);
		b.report(READ, "ann", { position: 100, mode: "scroll", dialWpm: null }, 10_000, T0 + 4 * SEC);
		const scroll = b.members(READ, T0 + 30 * SEC)[0]?.wpm ?? 0;
		expect(scroll).toBeLessThanOrEqual(SANE_WPM_CEILING);

		const end = readAt(b, "bo", { seconds: 60, wpm: 5_000, mode: "rsvp", dial: 9_999 });
		const bo = b.members(READ, end).find((m) => m.userId === "bo");
		expect(bo?.wpm).toBeLessThanOrEqual(MAX_PLAUSIBLE_WPM);
	});

	test("a pause does not bank credit for a jump afterwards", () => {
		const { board: b } = board();
		b.report(READ, "ann", { position: 0, mode: "scroll", dialWpm: null }, 10_000, T0);
		b.report(
			READ,
			"ann",
			{ position: 5_000, mode: "scroll", dialWpm: null },
			10_000,
			T0 + 28 * SEC,
		);
		// At most the capped refill (10 s at 800 wpm) is credited.
		const credited = (b.members(READ, T0 + 28 * SEC)[0]?.wpm ?? 0) * (28 / 60);
		expect(credited).toBeLessThanOrEqual((SANE_WPM_CEILING * 10) / 60 + 1);
	});

	test("silence past the idle limit drops the reader, and the next report starts a new sitting", () => {
		const { board: b, changes } = board();
		const end = readAt(b, "ann", { seconds: 60, wpm: 300 });
		b.tick(end + LIVE_IDLE_MS - SEC);
		expect(b.members(READ, end)).toHaveLength(1);
		b.tick(end + LIVE_IDLE_MS + SEC);
		expect(b.members(READ, end)).toHaveLength(0);
		expect(b.readIds()).toEqual([]);
		expect(changes.at(-1)).toBe(READ);

		const later = end + LIVE_IDLE_MS + 5 * SEC;
		b.report(READ, "ann", { position: 400, mode: "scroll", dialWpm: null }, 10_000, later);
		expect(b.members(READ, later + 25 * SEC)[0]?.wpm).toBe(0);
	});

	test("a stop sent before the latest report is ignored; a later one or one without a time applies", () => {
		const { board: b } = board();
		const at = (sentAt?: number) => ({
			position: 10,
			mode: "scroll" as const,
			dialWpm: null,
			sentAt,
		});
		b.report(READ, "ann", at(5_000), 10_000, T0);
		b.stop(READ, "ann", 4_000);
		expect(b.members(READ, T0)).toHaveLength(1);
		b.stop(READ, "ann", 6_000);
		expect(b.members(READ, T0)).toHaveLength(0);

		b.report(READ, "ann", at(7_000), 10_000, T0);
		b.stop(READ, "ann");
		expect(b.members(READ, T0)).toHaveLength(0);
	});

	test("stop ends reading now at once, for one read or everywhere", () => {
		const { board: b } = board();
		b.report(READ, "ann", { position: 0, mode: "scroll", dialWpm: null }, 10_000, T0);
		b.report("read-2", "ann", { position: 0, mode: "scroll", dialWpm: null }, 10_000, T0);
		b.stop(READ, "ann");
		expect(b.members(READ, T0)).toHaveLength(0);
		expect(b.members("read-2", T0)).toHaveLength(1);
		b.stopEverywhere("ann");
		expect(b.members("read-2", T0)).toHaveLength(0);
	});
});
