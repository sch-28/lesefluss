import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ListenRecorder } from "../listen-sessions";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "Europe/Berlin";
});
afterAll(() => {
	process.env.TZ = ORIGINAL_TZ;
});

const MINUTE = 60_000;
const at = (h: number, m = 0, day = 10) => new Date(2026, 9, day, h, m).getTime();

function recorder() {
	let n = 0;
	return new ListenRecorder("abcd1234", () => `s${++n}`);
}

describe("ListenRecorder", () => {
	it("records spoken time and words as a listen sitting with no speed", () => {
		const [row] = recorder().ingest(
			[{ startedAt: at(8), endedAt: at(8, 10), startWord: 100, endWord: 1800 }],
			at(8, 10),
		);
		expect(row).toMatchObject({
			id: "s1",
			bookId: "abcd1234",
			mode: "listen",
			durationMs: 10 * MINUTE,
			wordsRead: 1700,
			startWord: 100,
			endWord: 1800,
			furthestWord: 1800,
			wpmAvg: null,
		});
	});

	it("updates one row as the running interval grows", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 1), startWord: 0, endWord: 170 }], at(8, 1));
		const [row] = r.ingest(
			[{ startedAt: at(8), endedAt: at(8, 2), startWord: 0, endWord: 340 }],
			at(8, 2),
		);
		expect(row).toMatchObject({ id: "s1", durationMs: 2 * MINUTE, wordsRead: 340 });
	});

	it("keeps short pauses in one sitting and counts only time spoken", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 5), startWord: 0, endWord: 850 }], at(8, 5));
		const [row] = r.ingest(
			[{ startedAt: at(8, 8), endedAt: at(8, 13), startWord: 850, endWord: 1700 }],
			at(8, 13),
		);
		expect(row).toMatchObject({
			id: "s1",
			startedAt: at(8),
			endedAt: at(8, 13),
			durationMs: 10 * MINUTE,
			wordsRead: 1700,
		});
	});

	it("opens a new sitting after a long pause", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 5), startWord: 0, endWord: 850 }], at(8, 5));
		const [row] = r.ingest(
			[{ startedAt: at(9), endedAt: at(9, 5), startWord: 850, endWord: 1700 }],
			at(9, 5),
		);
		expect(row?.id).toBe("s2");
	});

	it("splits listening across midnight into one row per day", () => {
		const r = recorder();
		const interval = { startedAt: at(23, 50), endedAt: at(0, 10, 11), startWord: 0, endWord: 4000 };
		const rows = r.ingest([interval], at(0, 10, 11));
		expect(rows.map((row) => [row.id, row.wordsRead])).toEqual([
			["s1", 2000],
			["s2", 2000],
		]);
		expect(rows[0]?.endedAt).toBeLessThan(at(0, 0, 11));

		const later = r.ingest([{ ...interval, endedAt: at(0, 20, 11), endWord: 6000 }], at(0, 20, 11));
		expect(later.map((row) => row.id)).toEqual(["s1", "s2"]);
	});

	it("counts words heard twice once", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 5), startWord: 0, endWord: 850 }], at(8, 5));
		const [row] = r.ingest(
			[{ startedAt: at(8, 6), endedAt: at(8, 10), startWord: 842, endWord: 1500 }],
			at(8, 10),
		);
		expect(row?.wordsRead).toBe(1500);
	});

	it("survives the clock going back across midnight", () => {
		const rows = recorder().ingest(
			[{ startedAt: at(0, 1, 11), endedAt: at(23, 59, 10), startWord: 0, endWord: 40 }],
			at(0, 2, 11),
		);
		expect(rows).toEqual([]);
	});

	it("keeps updating a written sitting even when later drains add little", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 1), startWord: 0, endWord: 170 }], at(8, 1));
		const [row] = r.ingest(
			[{ startedAt: at(8, 2), endedAt: at(8, 2) + 2000, startWord: 170, endWord: 172 }],
			at(8, 3),
		);
		expect(row).toMatchObject({ id: "s1", wordsRead: 172 });
	});

	it("drops a sitting too short to be listening", () => {
		expect(
			recorder().ingest(
				[{ startedAt: at(8), endedAt: at(8) + 3000, startWord: 0, endWord: 8 }],
				at(8, 1),
			),
		).toEqual([]);
	});
});

describe("ListenRecorder when its row is deleted elsewhere", () => {
	it("goes on under a new id holding only the playback after the deletion", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 5), startWord: 0, endWord: 850 }], at(8, 5));
		expect(r.forgetDeleted(new Set(["s1"]), at(8, 5))).toEqual(["s1"]);
		// The log repeats the running interval from its start.
		const [row] = r.ingest(
			[{ startedAt: at(8), endedAt: at(8, 10), startWord: 0, endWord: 1700 }],
			at(8, 10),
		);
		expect(row).toMatchObject({
			id: "s2",
			startedAt: at(8, 5),
			durationMs: 5 * MINUTE,
			startWord: 850,
			wordsRead: 850,
		});
	});

	it("ignores deletions of other sessions", () => {
		const r = recorder();
		r.ingest([{ startedAt: at(8), endedAt: at(8, 5), startWord: 0, endWord: 850 }], at(8, 5));
		expect(r.forgetDeleted(new Set(["other"]), at(8, 5))).toEqual([]);
		const [row] = r.ingest(
			[{ startedAt: at(8), endedAt: at(8, 10), startWord: 0, endWord: 1700 }],
			at(8, 10),
		);
		expect(row).toMatchObject({ id: "s1", durationMs: 10 * MINUTE });
	});
});
