import { beforeEach, describe, expect, it } from "vitest";
import {
	type PendingPosition,
	readPendingPosition,
	recoverPendingWord,
	writePendingPosition,
} from "./pending-position";

const BOOK = "book-1";

describe("recoverPendingWord (resume reconcile)", () => {
	const pending = (word: number, at: number): PendingPosition => ({ word, at });

	it("recovers a pending word that is newer than the DB row and points elsewhere", () => {
		expect(recoverPendingWord(100, 1000, pending(500, 2000))).toBe(500);
	});

	it("keeps the seeded word when the pending entry is older (committed save wins)", () => {
		expect(recoverPendingWord(500, 2000, pending(100, 1000))).toBeNull();
	});

	it("requires the pending entry to be STRICTLY newer (equal timestamp keeps seed)", () => {
		expect(recoverPendingWord(500, 2000, pending(100, 2000))).toBeNull();
	});

	it("ignores a pending entry that just mirrors the seed (no clobber-back)", () => {
		expect(recoverPendingWord(500, 1000, pending(500, 9999))).toBeNull();
	});

	it("keeps the seeded word when there is no pending entry", () => {
		expect(recoverPendingWord(500, 1000, null)).toBeNull();
	});
});

describe("teardown safety net round-trip", () => {
	beforeEach(() => localStorage.clear());

	it("recovers a position that a skipped teardown mirrored to the durable fallback", () => {
		// Simulate: DB row is stale (resumed at 100, lastRead older). A back-nav
		// teardown skipped the DB save but mirrored the moved position (500) to the
		// fallback. Next open must restore 500, not 100.
		writePendingPosition(BOOK, 500, 2000);
		const pending = readPendingPosition(BOOK);
		expect(recoverPendingWord(100, 1000, pending)).toBe(500);
	});

	it("does not resurrect a stale fallback once the DB has caught up", () => {
		writePendingPosition(BOOK, 500, 2000);
		const pending = readPendingPosition(BOOK);
		// DB committed 500 at a later time -> seed already at 500, fallback ignored.
		expect(recoverPendingWord(500, 3000, pending)).toBeNull();
	});
});
