import { describe, expect, test } from "vitest";
import {
	deriveMilestones,
	MILESTONE_SITTING_MIN_MS,
	type MilestoneSession,
	milestonesReachedBetween,
} from "../milestones";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 12);
const utcDay = (at: number) => [new Date(at).toISOString().slice(0, 10)];

function sitting(day: number, over: Partial<MilestoneSession> = {}): MilestoneSession {
	return {
		mode: "scroll",
		startedAt: T0 + day * DAY,
		durationMs: 30 * 60_000,
		wordsRead: 7500,
		...over,
	};
}

const derive = (sessions: MilestoneSession[], finishedAt: number[] = []) =>
	deriveMilestones({ sessions, finishedAt, dayKeysOf: utcDay });

describe("deriveMilestones", () => {
	test("nothing read: no medals, the first tiers are next (RSVP only once measured)", () => {
		const m = derive([]);
		expect(m.reached).toEqual([]);
		expect(m.next.map((n) => n.kind).sort()).toEqual(["books", "hours", "streak", "words"]);
	});

	test("words: the highest tier reached, dated by the sitting that crossed it", () => {
		const sessions = Array.from({ length: 14 }, (_, i) => sitting(i * 3));
		const m = derive(sessions);
		// 14 × 7500 = 105,000: 100k is crossed by the 14th sitting.
		expect(m.reached.find((r) => r.kind === "words")).toEqual({
			kind: "words",
			threshold: 100_000,
			reachedAt: sessions[13].startedAt,
		});
		expect(m.next.find((n) => n.kind === "words")).toEqual({
			kind: "words",
			threshold: 500_000,
			current: 105_000,
		});
	});

	test("hours: 10h at 20 half-hour sittings, current floored", () => {
		const sessions = Array.from({ length: 21 }, (_, i) => sitting(i * 3, { wordsRead: 10 }));
		const m = derive(sessions);
		expect(m.reached.find((r) => r.kind === "hours")).toMatchObject({
			threshold: 10,
			reachedAt: sessions[19].startedAt,
		});
		expect(m.next.find((n) => n.kind === "hours")).toMatchObject({ threshold: 25, current: 10 });
	});

	test("books: tiers count finished books in finish order", () => {
		const finished = [5, 1, 4, 2, 3].map((d) => T0 + d * DAY);
		const m = derive([], finished);
		expect(m.reached.find((r) => r.kind === "books")).toEqual({
			kind: "books",
			threshold: 5,
			reachedAt: T0 + 5 * DAY,
		});
		expect(m.next.find((n) => n.kind === "books")).toMatchObject({ threshold: 10, current: 5 });
	});

	test("streak: 7 consecutive days reach the first tier on the seventh day", () => {
		const sessions = Array.from({ length: 8 }, (_, i) => sitting(i));
		const m = derive(sessions);
		expect(m.reached.find((r) => r.kind === "streak")).toMatchObject({
			threshold: 7,
			reachedAt: sessions[6].startedAt,
		});
		expect(m.next.find((n) => n.kind === "streak")).toMatchObject({ threshold: 14, current: 8 });
	});

	test("streak: a gap breaks the run, so two 5-day runs reach nothing", () => {
		const sessions = [
			...Array.from({ length: 5 }, (_, i) => sitting(i)),
			...Array.from({ length: 5 }, (_, i) => sitting(20 + i)),
		];
		const m = derive(sessions);
		expect(m.reached.find((r) => r.kind === "streak")).toBeUndefined();
		expect(m.next.find((n) => n.kind === "streak")).toMatchObject({ threshold: 7, current: 5 });
	});

	test("RSVP speed: the best qualifying sitting, short and implausible ones left out", () => {
		const m = derive([
			sitting(0, { mode: "rsvp", durationMs: 10 * 60_000, wordsRead: 4200 }),
			sitting(1, { mode: "rsvp", durationMs: MILESTONE_SITTING_MIN_MS - 1000, wordsRead: 4000 }),
			sitting(2, { mode: "rsvp", durationMs: 10 * 60_000, wordsRead: 50_000 }),
			sitting(3, { mode: "scroll", durationMs: 10 * 60_000, wordsRead: 6000 }),
		]);
		expect(m.reached.find((r) => r.kind === "rsvpWpm")).toEqual({
			kind: "rsvpWpm",
			threshold: 400,
			reachedAt: T0,
		});
		expect(m.next.find((n) => n.kind === "rsvpWpm")).toMatchObject({
			threshold: 500,
			current: 420,
		});
	});

	test("listening counts toward words and hours but never toward RSVP speed", () => {
		const m = derive([sitting(0, { mode: "listen", durationMs: 10 * 60_000, wordsRead: 5000 })]);
		expect(m.next.find((n) => n.kind === "rsvpWpm")).toBeUndefined();
		expect(m.next.find((n) => n.kind === "words")?.current).toBe(5000);
	});

	test("reached is newest first, next closest first", () => {
		const sessions = Array.from({ length: 14 }, (_, i) => sitting(i));
		const m = derive(sessions, [T0]);
		expect(m.reached.map((r) => r.kind)).toEqual(["words", "streak", "books"]);
		const shares = m.next.map((n) => n.current / n.threshold);
		expect([...shares].sort((a, b) => b - a)).toEqual(shares);
	});
});

describe("milestonesReachedBetween", () => {
	test("keeps only the milestones a visit earned", () => {
		const sessions = Array.from({ length: 14 }, (_, i) => sitting(i * 3));
		const m = derive(sessions);
		const last = sessions[13].startedAt;
		expect(milestonesReachedBetween(m, last, last + 1).map((r) => r.kind)).toEqual(["words"]);
		expect(milestonesReachedBetween(m, last + 1, last + DAY)).toEqual([]);
	});
});
