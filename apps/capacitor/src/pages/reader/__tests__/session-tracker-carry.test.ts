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
	const carry: CarryStore = createCarryStore();
	const persisted: SessionRow[] = [];

	function open(bookId = "book1", mode: "scroll" | "rsvp" = "scroll") {
		const tracker = new SessionTracker({
			bookId,
			mode,
			getPosition: () => position,
			getWpmSetting: () => 300,
			persist: (row) => persisted.push(row),
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
		wait(ms: number) {
			clock += ms;
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

	it("keeps modes apart, since a row's mode decides the speed it counts for", () => {
		const env = setup();
		env.burst(40_000, "book1", "scroll");
		env.wait(30_000);
		env.burst(30_000, "book1", "rsvp");
		expect(env.persisted).toHaveLength(0);
		env.wait(30_000);
		env.burst(30_000, "book1", "scroll");
		expect(env.persisted).toHaveLength(1);
		expect(env.persisted[0].mode).toBe("scroll");
		expect(env.persisted[0].durationMs).toBe(70_000);
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

	it("takes a carry at most once", () => {
		const carry = createCarryStore();
		carry.stash({
			id: "a",
			bookId: "b",
			mode: "scroll",
			dayKey: localDateKey(1_000_000),
			startedAt: 0,
			startPos: 0,
			readSpans: [],
			accumulatedActiveMs: 1,
			lastActivityAt: 1_000_000,
		});
		expect(carry.take("b", "scroll", 1_000_001)?.id).toBe("a");
		expect(carry.take("b", "scroll", 1_000_001)).toBeNull();
	});
});
