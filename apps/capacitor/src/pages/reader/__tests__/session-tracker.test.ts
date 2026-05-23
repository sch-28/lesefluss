/** biome-ignore-all lint/style/noNonNullAssertion: test fixture array access */
import type { WordPosition } from "@lesefluss/core";
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

/** A book content string with predictable word density: 1 word per 5 bytes
 *  ("aaaa " repeated). Position deltas translate cleanly into word counts. */
const BOOK = "aaaa ".repeat(20_000); // 100k bytes, 20k words

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
		content: BOOK,
		getPosition: () => position,
		wpmSetting: opts?.wpm ?? 250,
		persist: (row, kind) => persisted.push({ row, kind }),
		now: () => clock,
		newId: () => `id${++idCounter}`,
		// BOOK = "aaaa " × N → exactly 5 bytes per word; map by integer division.
		byteToWord: (byte) => Math.floor(byte / 5) as unknown as WordPosition,
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
		env.movePosition(100); // 20 words
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
		env.movePosition(100);
		env.tracker.finalize();
		expect(env.persisted).toHaveLength(0);
	});

	it("drops session below MIN_WORDS", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(10); // 2 words
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
		env.movePosition(100);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.durationMs).toBe(30_000);
	});

	it("checkpoints on transition to background (preserves data if app killed)", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(100);
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
		env.movePosition(100);
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
		env.movePosition(100);
		env.tracker.tick();
		env.tracker.finalize();
		// 30s before idle + 10s after resume = 40s; idle gap excluded.
		expect(env.persisted.at(-1)!.row.durationMs).toBe(40_000);
	});

	it("hard-ends after HARD_END_MS without activity", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(100);
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
		env.movePosition(100);
		env.tracker.tick();
		for (let elapsed = 0; elapsed < HARD_END_MS + POLL_MS; elapsed += POLL_MS) {
			env.advance(POLL_MS);
			env.tracker.tick();
		}
		const firstId = env.persisted.find((p) => p.kind === "flush")!.row.id;
		env.tracker.markActivity();
		env.advance(20_000);
		env.movePosition(100);
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
		env.movePosition(100);
		env.tracker.tick();
		env.tracker.setForeground(false);
		env.advance(HARD_END_MS + 60_000); // long background
		env.tracker.setForeground(true);
		const firstId = env.persisted.find((p) => p.kind === "flush")!.row.id;
		env.advance(20_000);
		env.movePosition(100);
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
		env.movePosition(100);
		env.tracker.tick();
		const sessionId = env.tracker._inspect().sessionId;
		env.tracker.setForeground(false);
		env.advance(60_000); // 1 min background
		env.tracker.setForeground(true);
		env.advance(20_000);
		env.movePosition(100);
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
		env.movePosition(100);
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
		env.movePosition(100);
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
		env.movePosition(100);
		for (let elapsed = 0; elapsed <= HEARTBEAT_MS * 3; elapsed += POLL_MS) {
			env.advance(POLL_MS);
			env.movePosition(5); // 1 word per tick to keep activity fresh
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
			env.movePosition(50); // 10 words; below jump threshold (1000)
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
		env.movePosition(5000); // jump (> scroll threshold 1000)
		env.tracker.tick();
		// Words not counted from the jump → below MIN_WORDS.
		env.tracker.finalize();
		expect(env.persisted).toHaveLength(0);
	});

	it("stores wpmSetting for rsvp mode, computed wpm for scroll", () => {
		const env = setup({ mode: "rsvp", wpm: 300 });
		env.tracker.setReading(true);
		env.advance(60_000);
		env.movePosition(500); // 100 words
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.wpmAvg).toBe(300);

		const env2 = setup({ mode: "scroll" });
		env2.tracker.setReading(true);
		env2.advance(60_000);
		env2.movePosition(500); // 100 words in 60s = 100 WPM
		env2.tracker.tick();
		env2.tracker.finalize();
		expect(env2.persisted.at(-1)!.row.wpmAvg).toBe(100);
	});

	it("RSVP pause (via setReading=false on RSVP) pauses session", () => {
		const env = setup({ mode: "rsvp", wpm: 300 });
		env.tracker.setReading(true);
		env.advance(20_000);
		env.movePosition(100); // 20 words
		env.tracker.tick();
		env.tracker.setReading(false); // RSVP paused
		env.advance(60_000); // 1 min paused — must not count
		env.tracker.setReading(true);
		env.advance(10_000);
		env.movePosition(100);
		env.tracker.tick();
		env.tracker.finalize();
		expect(env.persisted.at(-1)!.row.durationMs).toBe(30_000);
	});

	it("setContent updates byte buffer for late-loading content", () => {
		// Regression: tracker constructed with empty string (content not yet
		// loaded), then setContent called after content arrives. Word counts
		// must use the new buffer, not the stale empty one.
		let clock = 1_000_000;
		const persisted: Array<{ row: SessionRow; kind: "checkpoint" | "flush" }> = [];
		let position = 0;
		const tracker = new SessionTracker({
			bookId: "book1",
			mode: "scroll",
			content: "", // empty at construction
			getPosition: () => position,
			wpmSetting: null,
			persist: (row, kind) => persisted.push({ row, kind }),
			now: () => clock,
			newId: () => "id1",
			byteToWord: (byte) => Math.floor(byte / 5) as unknown as WordPosition,
		});
		tracker.setContent(BOOK);
		tracker.setReading(true);
		clock += 30_000;
		position = 100; // 20 words in BOOK
		tracker.tick();
		tracker.finalize();
		expect(persisted).toHaveLength(1);
		expect(persisted[0]!.row.wordsRead).toBe(20);
	});

	it("finalize on already-finalized tracker is a no-op", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.advance(30_000);
		env.movePosition(100);
		env.tracker.tick();
		env.tracker.finalize();
		const count = env.persisted.length;
		env.tracker.finalize();
		expect(env.persisted.length).toBe(count);
	});
});
