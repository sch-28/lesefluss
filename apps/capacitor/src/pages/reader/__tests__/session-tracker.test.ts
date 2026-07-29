/** biome-ignore-all lint/style/noNonNullAssertion: test fixture array access */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	HARD_END_MS,
	HEARTBEAT_MS,
	MIN_DURATION_MS,
	POLL_MS,
	type SessionRow,
	SessionTracker,
	SOFT_IDLE_MS,
} from "../session-tracker";

function setup(opts?: {
	mode?: "scroll" | "page" | "rsvp";
	wpm?: number | null;
	initialPos?: number;
}) {
	let clock = 1_000_000; // arbitrary epoch ms
	let position = opts?.initialPos ?? 0;
	let idCounter = 0;
	const persisted: Array<{ row: SessionRow; kind: "checkpoint" | "flush" }> = [];

	const tracker = new SessionTracker({
		bookId: "book1",
		mode: opts?.mode ?? "scroll",
		getPosition: () => position,
		wpmSetting: opts?.wpm ?? 250,
		persist: (row, kind) => persisted.push({ row, kind }),
		now: () => clock,
		newId: () => `id${++idCounter}`,
	});

	return {
		tracker,
		persisted,
		advance(ms: number) {
			clock += ms;
		},
		setClock(ms: number) {
			clock = ms;
		},
		movePosition(delta: number) {
			position += delta;
		},
		setPosition(p: number) {
			position = p;
		},
		get clock() {
			return clock;
		},
	};
}

describe("SessionTracker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("opens session on setReading(true) and accumulates active time", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		// Move position so word count clears MIN_WORDS.
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted).toHaveLength(1);
		expect(env.persisted[0]!.kind).toBe("flush");
		expect(env.persisted[0]!.row.durationMs).toBe(30_000);
		expect(env.persisted[0]!.row.wordsRead).toBe(20);
		expect(env.persisted[0]!.row.bookId).toBe("book1");
	});

	it("drops session below MIN_DURATION", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(MIN_DURATION_MS - 1);
		env.movePosition(20);
		env.tracker.finalize();
		expect(env.persisted).toHaveLength(0);
	});

	it("drops session below MIN_WORDS", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(2); // below MIN_WORDS=5
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted).toHaveLength(0);
	});

	it("excludes foreground=false time from active duration", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(20_000);
		env.tracker.setForeground(false); // background
		env.advance(60_000); // 60s in background, must not count
		env.tracker.setForeground(true);
		env.advance(10_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.durationMs).toBe(30_000);
	});

	it("checkpoints on transition to background (preserves data if app killed)", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		const beforeBg = env.persisted.length;
		env.tracker.setForeground(false);
		expect(env.persisted.length).toBeGreaterThan(beforeBg);
		expect(env.persisted.at(-1)!.kind).toBe("checkpoint");
		expect(env.persisted.at(-1)!.row.durationMs).toBe(30_000);
	});

	it("soft-idle pauses time accrual but keeps session alive", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		// Idle for > SOFT_IDLE_MS, ticking periodically.
		for (let elapsed = 0; elapsed < SOFT_IDLE_MS + POLL_MS; elapsed += POLL_MS) {
			env.advance(POLL_MS);
			env.tracker.tick();
		}
		expect(env.tracker._inspect().hasSession).toBe(true);
		expect(env.tracker._inspect().activeSinceMs).toBeNull();
		// Resume on activity.
		env.tracker.markActivity();
		expect(env.tracker._inspect().activeSinceMs).not.toBeNull();
		env.advance(10_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		// 30s before idle + 10s after resume = 40s; idle gap excluded.
		expect(env.persisted.at(-1)!.row.durationMs).toBe(40_000);
	});

	it("hard-ends after HARD_END_MS without activity", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		// Tick past HARD_END_MS with no activity.
		for (let elapsed = 0; elapsed < HARD_END_MS + POLL_MS; elapsed += POLL_MS) {
			env.advance(POLL_MS);
			env.tracker.tick();
		}
		expect(env.tracker._inspect().hasSession).toBe(false);
		// Final row was written by the hard-end finalize path.
		expect(env.persisted.some((p) => p.kind === "flush")).toBe(true);
	});

	it("opens a fresh session on activity after hard-end", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		for (let elapsed = 0; elapsed < HARD_END_MS + POLL_MS; elapsed += POLL_MS) {
			env.advance(POLL_MS);
			env.tracker.tick();
		}
		const firstId = env.persisted.find((p) => p.kind === "flush")!.row.id;
		env.tracker.markActivity();
		env.advance(20_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		const secondFlush = env.persisted.filter((p) => p.kind === "flush").pop()!;
		expect(secondFlush.row.id).not.toBe(firstId);
		expect(secondFlush.row.durationMs).toBe(20_000);
	});

	it("returning to foreground after >HARD_END_MS finalizes old + opens new", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.setForeground(false);
		env.advance(HARD_END_MS + 60_000); // long background
		env.tracker.setForeground(true);
		const firstId = env.persisted.find((p) => p.kind === "flush")!.row.id;
		env.advance(20_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		const secondFlush = env.persisted.filter((p) => p.kind === "flush").pop()!;
		expect(secondFlush.row.id).not.toBe(firstId);
		expect(secondFlush.row.durationMs).toBe(20_000);
	});

	it("returning to foreground within HARD_END_MS resumes same session", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		const sessionId = env.tracker._inspect().sessionId;
		env.tracker.setForeground(false);
		env.advance(60_000); // 1 min background
		env.tracker.setForeground(true);
		env.advance(20_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		// One flush row, same id.
		const flushes = env.persisted.filter((p) => p.kind === "flush");
		expect(flushes).toHaveLength(1);
		expect(flushes[0]!.row.id).toBe(sessionId);
		// 30s + 20s, background excluded.
		expect(flushes[0]!.row.durationMs).toBe(50_000);
	});

	it("treats large poll gaps as throttled timer (no spurious idle)", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		// Simulate setInterval not firing for 5 minutes (screen lock).
		env.advance(SOFT_IDLE_MS + 60_000);
		env.tracker.tick(); // first tick after wake; pollDelta >> guard
		// Session must still be alive and not soft-paused.
		expect(env.tracker._inspect().hasSession).toBe(true);
		expect(env.tracker._inspect().activeSinceMs).not.toBeNull();
		// Time accrued = pre-gap only; gap itself doesn't count.
		// Continue reading for 20s.
		env.advance(20_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		// 30s pre-gap + ~20s after; the throttled-tick path resets activeSinceMs
		// to the tick time, so the gap itself contributes 0.
		const row = env.persisted.at(-1)!.row;
		expect(row.durationMs).toBeGreaterThanOrEqual(45_000);
		expect(row.durationMs).toBeLessThanOrEqual(55_000);
	});

	it("issues a heartbeat checkpoint at HEARTBEAT_MS intervals", () => {
		const env = setup();
		env.tracker.setReading(true);
		// Need MIN_WORDS reached before checkpoint writes.
		env.movePosition(20);
		for (let elapsed = 0; elapsed <= HEARTBEAT_MS * 3; elapsed += POLL_MS) {
			env.advance(POLL_MS);
			env.movePosition(1); // 1 word per tick to keep activity fresh
			env.tracker.tick();
		}
		const checkpoints = env.persisted.filter((p) => p.kind === "checkpoint");
		expect(checkpoints.length).toBeGreaterThanOrEqual(2);
		// All checkpoints share the same session id (one row per sitting).
		const ids = new Set(checkpoints.map((c) => c.row.id));
		expect(ids.size).toBe(1);
	});

	it("counts position progress as activity (long-paragraph reader)", () => {
		// User scrolls a tiny amount every 2 min — without markActivity, the
		// position-polling path must still keep the session alive.
		const env = setup();
		env.tracker.setReading(true);
		// 2 min, then small scroll, repeat. Each scroll within SOFT_IDLE_MS.
		for (let i = 0; i < 5; i++) {
			env.advance(2 * 60_000);
			env.movePosition(10); // 10 words; below jump threshold (scroll = 200)
			env.tracker.tick();
		}
		env.tracker.finalize();
		const row = env.persisted.at(-1)!.row;
		expect(row.durationMs).toBe(10 * 60_000);
		expect(row.wordsRead).toBe(50);
	});

	it("does not count jump-sized position changes as words", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(500); // jump (> scroll threshold 200 words)
		env.tracker.tick();
		// Words not counted from the jump → below MIN_WORDS.
		env.tracker.finalize();
		expect(env.persisted).toHaveLength(0);
	});

	it("does not absorb the skipped span on the tick after a jump", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(5000); // jump, far above the scroll threshold of 400
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(20);
	});

	it("keeps words read before a jump as well as after it", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(5000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(120);
	});

	it("does not re-credit a range already read when the user jumps back over it", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		for (let i = 0; i < 3; i++) {
			env.movePosition(300);
			env.tracker.tick();
			env.advance(POLL_MS);
		}
		env.setPosition(0); // scrub back to the start
		env.tracker.tick();
		for (let i = 0; i < 3; i++) {
			env.advance(POLL_MS);
			env.movePosition(300);
			env.tracker.tick();
		}
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(900);
	});

	it("keeps crediting after peeking ahead and scrubbing back", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(300);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(40_000); // peek at the end
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(300); // scrub back to where reading stopped
		env.tracker.tick();
		for (let i = 0; i < 9; i++) {
			env.advance(POLL_MS);
			env.movePosition(300);
			env.tracker.tick();
		}
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(3000);
	});

	it("credits a range read after having been skipped past earlier", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(300); // read [0, 300]
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(5000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(300); // read [5000, 5300]
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(1000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(300); // read [1000, 1300], never seen before
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(900);
	});

	it("does not re-credit a range on a jump back into it", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		for (let i = 0; i < 3; i++) {
			env.movePosition(300);
			env.tracker.tick();
			env.advance(POLL_MS);
		}
		env.setPosition(0);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(400); // re-reads [0, 400], already credited
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(5000);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(900);
	});

	it("treats movement exactly at the threshold as a jump", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(400); // exactly JUMP_WORDS_PER_TICK.scroll
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(20);
	});

	it("credits each segment across several jumps in one sitting", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(2000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(50);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.setPosition(5000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(70);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(220);
	});

	it("keeps the closed segment when a jump is followed straight by finalize", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(5000);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(100);
	});

	it("never reports fewer words at flush than at the preceding checkpoint", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		env.advance(HEARTBEAT_MS + POLL_MS);
		env.movePosition(20);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(5000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(30);
		env.tracker.tick();
		env.tracker.finalize();
		const checkpoint = env.persisted.find((p) => p.kind === "checkpoint");
		const flush = env.persisted.at(-1)!;
		expect(checkpoint).toBeDefined();
		expect(flush.kind).toBe("flush");
		expect(flush.row.wordsRead).toBeGreaterThanOrEqual(checkpoint!.row.wordsRead);
		expect(flush.row.wordsRead).toBe(150);
	});

	it("discards a jump-sized span that appeared while the poll timer was suspended", () => {
		// The threshold is per-tick, so a long poll gap makes ordinary reading
		// indistinguishable from a jump and the span is not credited. Undercounts
		// rather than inflating, which is the safer direction for a stat.
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		env.advance(60_000);
		env.movePosition(1000);
		env.tracker.tick();
		env.advance(POLL_MS);
		env.movePosition(50);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wordsRead).toBe(150);
	});

	// The app being backgrounded overnight used to stamp the session as ending
	// when the user came back, producing a ten-hour row holding twenty minutes of
	// reading, which the hour histogram then smeared across the night.
	it("ends a backgrounded sitting at the last activity, not when the user returns", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		const lastActivity = env.clock;

		env.tracker.setForeground(false);
		env.advance(10 * 60 * 60_000);
		env.tracker.setForeground(true);

		const flushed = env.persisted.filter((p) => p.kind === "flush").at(-1);
		expect(flushed?.row.endedAt).toBe(lastActivity);
		expect((flushed?.row.endedAt ?? 0) - (flushed?.row.startedAt ?? 0)).toBeLessThan(HARD_END_MS);
	});

	it("ends an active sitting at the moment it is written", () => {
		const env = setup({ mode: "scroll" });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.endedAt).toBe(env.clock);
	});

	it("stores wpmSetting for rsvp mode, computed wpm for scroll", () => {
		const env = setup({ mode: "rsvp", wpm: 300 });
		env.tracker.setReading(true);
		env.advance(60_000);
		env.movePosition(100); // 100 words
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wpmAvg).toBe(300);

		const env2 = setup({ mode: "scroll" });
		env2.tracker.setReading(true);
		env2.advance(60_000);
		env2.movePosition(100); // 100 words in 60s = 100 WPM
		env2.tracker.tick();
		env2.tracker.finalize();
		expect(env2.persisted.at(-1)!.row.wpmAvg).toBe(100);
	});

	it("RSVP pause (via setReading=false on RSVP) pauses session", () => {
		const env = setup({ mode: "rsvp", wpm: 300 });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.setReading(false); // RSVP paused
		env.advance(60_000); // 1 min paused — must not count
		env.tracker.setReading(true);
		env.advance(10_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.durationMs).toBe(30_000);
	});

	it("finalize on already-finalized tracker is a no-op", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(20);
		env.tracker.tick();
		env.tracker.finalize();
		const count = env.persisted.length;
		env.tracker.finalize();
		expect(env.persisted.length).toBe(count);
	});
});
