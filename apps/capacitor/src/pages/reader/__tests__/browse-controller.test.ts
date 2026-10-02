import { describe, expect, it, vi } from "vitest";
import { BrowseController } from "../browse-controller";
import { BROWSE_MOVE_DISTANCE_WORDS } from "../browse-detector";

function setup({
	lastWord = 1_000,
	persisted = 1_000,
}: {
	lastWord?: number;
	persisted?: number;
} = {}) {
	let clock = 0;
	let rsvp = false;
	const state = { lastWord: lastWord as number | null, persisted: persisted as number | null };
	const session = { end: vi.fn(), discard: vi.fn(), rewind: vi.fn(), backfill: vi.fn() };
	const writes: number[] = [];
	const moves: number[] = [];
	const anchors: (number | null)[] = [];
	let undo: (() => void) | null = null;
	const notified: number[] = [];

	const controller = new BrowseController({
		getLastWord: () => state.lastWord,
		getPersistedWord: () => state.persisted,
		isRsvp: () => rsvp,
		writePosition: (word) => {
			writes.push(word);
			state.persisted = word;
		},
		showUnsavedMove: (word) => {
			moves.push(word);
			state.lastWord = word;
		},
		getSession: () => session,
		onAnchorChange: (anchor) => anchors.push(anchor),
		notifyAutoCommit: (word, u) => {
			notified.push(word);
			undo = u;
		},
		now: () => clock,
	});

	/** Applies a settle the way the reader does: record, then move lastWord. */
	const settle = (to: number, atMs: number) => {
		clock = atMs;
		const from = state.lastWord ?? to;
		const resumed = controller.recordSettle(from, to);
		state.lastWord = to;
		if (resumed) controller.autoCommit();
	};

	/** Reads on at the browsed spot until the controller auto-commits. */
	const readUntilAutoCommit = (from: number) => {
		let t = 0;
		for (let i = 1; notified.length === 0 && i <= 10; i++) {
			t += 45_000;
			settle(from + i * 100, t);
		}
		if (notified.length === 0) throw new Error("no auto-commit");
		return notified[0];
	};

	return {
		controller,
		readUntilAutoCommit,
		state,
		session,
		writes,
		moves,
		anchors,
		notified,
		settle,
		undo: () => undo?.(),
		setRsvp: (value: boolean) => {
			rsvp = value;
		},
	};
}

describe("BrowseController", () => {
	it("a jump enters browse at the current word without writing an already-saved anchor", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		expect(env.controller.anchor).toBe(1_000);
		expect(env.writes).toEqual([]);
		expect(env.session.rewind).toHaveBeenCalledWith(1_000);
	});

	it("persists an anchor the DB doesn't hold yet", () => {
		const env = setup({ lastWord: 1_200, persisted: 1_000 });
		env.controller.start();
		expect(env.writes).toEqual([1_200]);
	});

	it("a jump to the current word doesn't browse", () => {
		const env = setup();
		env.controller.enterForJump(1_000);
		expect(env.controller.isBrowsing).toBe(false);
	});

	it("back moves the view to the anchor without writing", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		env.state.lastWord = 5_000;
		env.controller.back();
		expect(env.controller.isBrowsing).toBe(false);
		expect(env.moves).toEqual([1_000]);
		expect(env.writes).toEqual([]);
		expect(env.session.end).not.toHaveBeenCalled();
	});

	it("read from here without moving keeps the sitting and writes nothing", () => {
		const env = setup();
		env.controller.start();
		env.controller.readFromHere();
		expect(env.controller.isBrowsing).toBe(false);
		expect(env.writes).toEqual([]);
		expect(env.session.end).not.toHaveBeenCalled();
	});

	it("read from here after moving ends the sitting and commits the word", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		env.state.lastWord = 5_000;
		env.controller.readFromHere();
		expect(env.session.end).toHaveBeenCalledOnce();
		expect(env.writes).toEqual([5_000]);
	});

	it("a fast long scroll enters browse anchored where reading stopped", () => {
		const env = setup();
		env.settle(1_100, 60_000);
		env.settle(1_200, 120_000);
		for (let i = 1; i <= 3; i++) env.settle(1_200 + i * 800, 120_000 + i * 1_000);
		expect(env.controller.anchor).toBe(1_200);
		expect(env.writes).toEqual([1_200]);
		expect(env.session.rewind).toHaveBeenCalledWith(1_200);
	});

	it("steady reading never browses", () => {
		const env = setup();
		for (let i = 1; i <= 200; i++) env.settle(1_000 + i * 60, i * 5_000);
		expect(env.anchors).toEqual([]);
	});

	it("resumed reading auto-commits, credits the streak, and undo restores the anchor", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		env.state.lastWord = 5_000;
		env.readUntilAutoCommit(5_000);
		const committed = env.notified[0];
		expect(env.controller.isBrowsing).toBe(false);
		expect(env.writes).toEqual([committed]);
		expect(env.session.backfill).toHaveBeenCalledWith(
			expect.objectContaining({ to: committed, activeMs: expect.any(Number) }),
		);
		expect(env.session.backfill.mock.calls[0][0].activeMs).toBeGreaterThan(0);

		env.undo();
		expect(env.writes).toEqual([committed, 1_000]);
		expect(env.moves).toEqual([1_000]);
		expect(env.session.discard).toHaveBeenCalledOnce();
	});

	it("undo is ignored once the reader is in RSVP", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		env.state.lastWord = 5_000;
		env.readUntilAutoCommit(5_000);
		const writesBefore = [...env.writes];
		env.setRsvp(true);
		env.undo();
		expect(env.moves).toEqual([]);
		expect(env.writes).toEqual(writesBefore);
	});

	it("undo is ignored once the reader is browsing again", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		env.state.lastWord = 5_000;
		env.readUntilAutoCommit(5_000);
		env.controller.start();
		const writesBefore = [...env.writes];
		env.undo();
		expect(env.moves).toEqual([]);
		expect(env.writes).toEqual(writesBefore);
		expect(env.controller.isBrowsing).toBe(true);
	});

	it("a device position while browsing moves the anchor only", () => {
		const env = setup();
		env.controller.start();
		expect(env.controller.onDevicePosition(7_000)).toBe(true);
		expect(env.controller.anchor).toBe(7_000);
		expect(env.moves).toEqual([]);
		env.controller.back();
		expect(env.moves).toEqual([7_000]);
	});

	it("a device position while not browsing is left to the reader", () => {
		const env = setup();
		expect(env.controller.onDevicePosition(7_000)).toBe(false);
	});

	it("reset leaves browse mode", () => {
		const env = setup();
		env.controller.start();
		env.controller.reset();
		expect(env.controller.isBrowsing).toBe(false);
		expect(env.anchors.at(-1)).toBeNull();
	});

	it("a single fling enters browse exactly at the long-move threshold", () => {
		const below = setup();
		below.settle(1_000 + BROWSE_MOVE_DISTANCE_WORDS - 1, 1_000);
		expect(below.controller.isBrowsing).toBe(false);
		const at = setup();
		at.settle(1_000 + BROWSE_MOVE_DISTANCE_WORDS, 1_000);
		expect(at.controller.anchor).toBe(1_000);
	});
	it("undo is ignored after a reset (the reader moved to another book or chapter)", () => {
		const env = setup();
		env.controller.enterForJump(5_000);
		env.state.lastWord = 5_000;
		env.readUntilAutoCommit(5_000);
		const writesBefore = [...env.writes];
		env.controller.reset();
		env.undo();
		expect(env.writes).toEqual(writesBefore);
		expect(env.moves).toEqual([]);
	});
});
