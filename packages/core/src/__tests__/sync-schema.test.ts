import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { SyncReadingSessionSchema } from "../sync";

type SessionInput = z.input<typeof SyncReadingSessionSchema>;

function session(overrides: Partial<SessionInput> = {}): SessionInput {
	return {
		sessionId: "abcd1234",
		bookId: "0123abcd",
		mode: "scroll" as const,
		startedAt: 1_000_000,
		endedAt: 1_660_000,
		durationMs: 660_000,
		wordsRead: 5,
		startWord: 0,
		endWord: 5,
		wpmAvg: 0,
		updatedAt: 1_660_000,
		...overrides,
	};
}

describe("SyncReadingSessionSchema", () => {
	it("accepts a session whose computed wpm rounds to zero", () => {
		expect(SyncReadingSessionSchema.safeParse(session()).success).toBe(true);
	});

	it("accepts a null wpm", () => {
		expect(SyncReadingSessionSchema.safeParse(session({ wpmAvg: null })).success).toBe(true);
	});

	it("still rejects a negative wpm", () => {
		expect(SyncReadingSessionSchema.safeParse(session({ wpmAvg: -1 })).success).toBe(false);
	});

	it("still rejects a session that ends before it starts", () => {
		const bad = session({ startedAt: 2_000_000, endedAt: 1_000_000 });
		expect(SyncReadingSessionSchema.safeParse(bad).success).toBe(false);
	});
});
