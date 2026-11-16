// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: async () => ({ value: null }), set: async () => {} },
}));
vi.mock("../../sync", () => ({ scheduleSyncPush: () => {} }));
afterAll(close);

const { resetBookProgress } = await import("../queries/books");

const FAR_FUTURE = 9_000_000_000_000;

function insertBook(fields: {
	status: string | null;
	finishedAt: number | null;
	updatedAt: number;
}) {
	raw
		.prepare(
			"INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, status, finished_at, updated_at) VALUES ('b1', 'B', 'txt', 1, 700, 1000, 0, 0, 0, ?, ?, ?)",
		)
		.run(fields.status, fields.finishedAt, fields.updatedAt);
}

function row() {
	return raw
		.prepare("SELECT word_position, status, finished_at, updated_at FROM books WHERE id = 'b1'")
		.get() as {
		word_position: number;
		status: string | null;
		finished_at: number | null;
		updated_at: number;
	};
}

beforeEach(() => {
	raw.exec("DELETE FROM books;");
});

describe("resetBookProgress", () => {
	it("goes back to the first word on Automatic and keeps the finish date", async () => {
		insertBook({ status: "finished", finishedAt: 1234, updatedAt: 10 });
		await resetBookProgress("b1");
		expect(row()).toMatchObject({ word_position: 0, status: null, finished_at: 1234 });
	});

	it("puts an unfinished book on Want to read, so its first-sitting marker can't bring a glance back to Reading", async () => {
		insertBook({ status: null, finishedAt: null, updatedAt: 10 });
		await resetBookProgress("b1");
		expect(row()).toMatchObject({ word_position: 0, status: "want", finished_at: null });
		const { bookStatus, statusAfterRealSitting } = await import("@lesefluss/core");
		const glanced = { wordCount: 1000, wordPosition: 40, status: "want", firstSittingAt: 5 };
		expect(bookStatus(glanced)).toBe("want");
		expect(statusAfterRealSitting(glanced)).toBe(null);
	});

	it("stamps a revision above the row's, even when the row's runs ahead of this clock", async () => {
		insertBook({ status: "reading", finishedAt: null, updatedAt: FAR_FUTURE });
		await resetBookProgress("b1");
		expect(row().updated_at).toBe(FAR_FUTURE + 1);
	});

	it("does nothing for an unknown book", async () => {
		await expect(resetBookProgress("missing")).resolves.toBeUndefined();
	});
});
