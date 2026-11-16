import { describe, expect, it } from "vitest";
import { type CarryStore, createCarryStore } from "../../../services/reading-sessions/carry";
import { HARD_END_MS, type SessionRow } from "../../../services/reading-sessions/rules";
import { localDateKey } from "../../../utils/date-utils";
import { POLL_MS, SessionTracker } from "../session-tracker";

/** One shared clock and carry store; each `burst` is a fresh reader visit (a tracker), as after a close and reopen. */
function setup() {
	let clock = 1_000_000;
	let position = 0;
	let ids = 0;
	let dial = 300;
	const carry: CarryStore = createCarryStore();
	const persisted: SessionRow[] = [];
	const removed: string[] = [];

	function open(bookId = "book1", mode: "scroll" | "rsvp" = "scroll") {
		const tracker = new SessionTracker({
			bookId,
			mode,
			getPosition: () => position,
			getWpmSetting: () => dial,
			persist: (row) => persisted.push(row),
			remove: (id) => removed.push(id),
			carry,
			now: () => clock,
			newId: () => `id${++ids}`,
		});
		tracker.setReading(true);
		return tracker;
	}

	/** Reads at about 240 wpm for `ms`, then closes the reader. */
	function burst(ms: number, bookId = "book1", mode: "scroll" | "rsvp" = "scroll") {
		const tracker = open(bookId, mode);
		for (let t = 0; t < ms; t += POLL_MS) {
			clock += POLL_MS;
			position += 20;
			tracker.tick();
		}
		tracker.finalize();
		return tracker;
	}

	return {
		open,
		burst,
		persisted,
		removed,
		carry,
		wait(ms: number) {
			clock += ms;
		},
		setDial(wpm: number) {
			dial = wpm;
		},
		advance(words: number) {
			position += words;
		},
		get position() {
			return position;
		},
		get clock() {
			return clock;
		},
	};
}

describe("SessionTracker short-burst carry", () => {
	it("adds short bursts on one book up into one sitting, saved once it reaches a minute", () => {
		const env = setup();
		const firstStart = env.clock;
		env.burst(30_000);
		expect(env.persisted).toHaveLength(0);
		env.wait(2 * 60_000);
		env.burst(20_000);
		expect(env.persisted).toHaveLength(0);
		env.wait(60_000);
		env.burst(15_000);

		expect(env.persisted).toHaveLength(1);
		const row = env.persisted[0];
		expect(row.id).toBe("id1");
		expect(row.startedAt).toBe(firstStart);
		expect(row.durationMs).toBe(65_000);
		expect(row.wordsRead).toBe(260);
		expect(row.startWord).toBe(0);
	});

	it("merges bursts across modes into one row of the mode read longest", () => {
		const env = setup();
		env.burst(40_000, "book1", "scroll");
		env.wait(30_000);
		env.burst(15_000, "book1", "rsvp");
		expect(env.persisted).toHaveLength(0);
		env.wait(30_000);
		env.burst(10_000, "book1", "rsvp");
		expect(env.persisted).toHaveLength(1);
		const row = env.persisted[0];
		expect(row.id).toBe("id1");
		expect(row.mode).toBe("scroll");
		expect(row.durationMs).toBe(65_000);
		expect(row.wpmAvg).toBe(240);
	});

	it("records the RSVP dial when a merged row is mostly RSVP, even if it ends in scroll", () => {
		const env = setup();
		env.burst(45_000, "book1", "rsvp");
		env.setDial(500);
		env.wait(30_000);
		env.burst(20_000, "book1", "scroll");
		expect(env.persisted).toHaveLength(1);
		expect(env.persisted[0].mode).toBe("rsvp");
		expect(env.persisted[0].wpmAvg).toBe(300);
	});

	it("keeps the RSVP dial through a later short burst in another mode", () => {
		const env = setup();
		env.burst(35_000, "book1", "rsvp");
		env.setDial(500);
		env.wait(30_000);
		env.burst(10_000, "book1", "scroll");
		env.wait(30_000);
		env.burst(20_000, "book1", "scroll");
		expect(env.persisted).toHaveLength(1);
		expect(env.persisted[0].mode).toBe("rsvp");
		expect(env.persisted[0].wpmAvg).toBe(300);
	});

	it("does not merge bursts across midnight, even close together", () => {
		const env = setup();
		const midnight = new Date(env.clock);
		midnight.setHours(24, 0, 0, 0);
		env.wait(midnight.getTime() - env.clock - 60_000);
		env.burst(40_000);
		env.wait(60_000);
		env.burst(40_000);
		expect(env.persisted).toHaveLength(0);
	});

	it("does not merge bursts on different books", () => {
		const env = setup();
		env.burst(40_000, "book1");
		env.wait(30_000);
		env.burst(40_000, "book2");
		expect(env.persisted).toHaveLength(0);
	});

	it("does not merge bursts further apart than a sitting's longest pause", () => {
		const env = setup();
		env.burst(40_000);
		env.wait(HARD_END_MS + POLL_MS);
		env.burst(40_000);
		expect(env.persisted).toHaveLength(0);
	});

	it("keeps the earlier bursts waiting when the burst that joined them is discarded", () => {
		const env = setup();
		env.burst(40_000);
		env.wait(30_000);
		env.open().discard();
		env.wait(30_000);
		env.burst(30_000);
		expect(env.persisted).toHaveLength(1);
		expect(env.persisted[0].durationMs).toBe(70_000);
	});

	it("keeps the earlier bursts when a merged row that was already saved is discarded", () => {
		const env = setup();
		env.burst(40_000);
		env.wait(30_000);
		const tracker = env.open();
		for (let t = 0; t < 35_000; t += POLL_MS) {
			env.wait(POLL_MS);
			env.advance(20);
			tracker.tick();
		}
		expect(env.persisted.at(-1)?.id).toBe("id1");
		tracker.discard();
		expect(env.removed).toEqual(["id1"]);
		env.wait(30_000);
		env.burst(30_000);
		const row = env.persisted.at(-1);
		expect(row?.id).not.toBe("id1");
		expect(row?.durationMs).toBe(70_000);
	});

	it("keeps the earlier bursts' words when this burst is rewound as browsing", () => {
		const env = setup();
		env.burst(40_000);
		const carriedEnd = env.position;
		env.wait(30_000);
		const tracker = env.open();
		for (let t = 0; t < 30_000; t += POLL_MS) {
			env.wait(POLL_MS);
			env.advance(20);
			tracker.tick();
		}
		tracker.rewindTo(0);
		tracker.finalize();
		expect(env.persisted).toHaveLength(1);
		expect(env.persisted[0].wordsRead).toBe(carriedEnd);
	});

	it("drops every carry on clear", () => {
		const env = setup();
		env.burst(40_000);
		env.carry.clear();
		env.wait(30_000);
		env.burst(30_000);
		expect(env.persisted).toHaveLength(0);
	});

	it("takes a carry at most once", () => {
		const carry = createCarryStore();
		carry.stash({
			id: "a",
			bookId: "b",
			dayKey: localDateKey(1_000_000),
			startedAt: 0,
			startPos: 0,
			readSpans: [],
			accumulatedActiveMs: 1,
			modeActiveMs: { scroll: 1 },
			rsvpDialWpm: null,
			lastActivityAt: 1_000_000,
		});
		expect(carry.take("b", 1_000_001)?.id).toBe("a");
		expect(carry.take("b", 1_000_001)).toBeNull();
	});
});
