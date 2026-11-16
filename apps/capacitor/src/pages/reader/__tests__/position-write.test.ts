// @vitest-environment node
import { QueryClient } from "@tanstack/react-query";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../services/db/__tests__/test-db";

const store = new Map<string, string>();
vi.stubGlobal("window", globalThis);
vi.stubGlobal("localStorage", {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => store.set(k, v),
	removeItem: (k: string) => store.delete(k),
	clear: () => store.clear(),
});

const { db, raw, close } = createTestDb();
vi.mock("../../../services/db/index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const sync = vi.hoisted(() => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../services/sync", () => sync);
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("../../../components/toast", () => ({ toast }));
vi.mock("../../../services/telemetry", () => ({
	reportEvent: vi.fn(),
	errorMessage: (e: unknown) => String(e),
}));

const { writeBookPosition, requestSyncPush } = await import("../position-write");
const { readPendingPosition } = await import("../pending-position");
const { isOwnRevision } = await import("../../../services/position-revisions");
const { queries } = await import("../../../services/db/queries");
const { bookKeys } = await import("../../../services/db/hooks/query-keys");

const row = () =>
	raw.prepare("SELECT word_position, updated_at, last_read FROM books WHERE id = 'b1'").get() as {
		word_position: number;
		updated_at: number;
		last_read: number;
	};

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	raw.exec("DELETE FROM books");
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at, last_read)
			 VALUES ('b1', 'Book', 'epub', 1, 100, 1000, 0, 500, 0, 1000, 1000, 1000)`,
		)
		.run();
});

describe("writeBookPosition", () => {
	it("writes the row, clears the pending mirror once it lands, and records its own revision", async () => {
		const qc = new QueryClient();
		const write = writeBookPosition(qc, { bookId: "b1", seriesId: null, word: 150, baseRev: 1000 });
		// Mirrored before the async write, so a teardown mid-write can recover it.
		expect(readPendingPosition("b1")?.word).toBe(150);

		expect(await write.outcome).toEqual({ kind: "written" });
		expect(row().word_position).toBe(150);
		expect(row().updated_at).toBe(write.stamp);
		expect(readPendingPosition("b1")).toBeNull();
		expect(isOwnRevision("b1", write.stamp)).toBe(true);
	});

	it("reports a newer row instead of replacing it", async () => {
		raw.exec("UPDATE books SET word_position = 400, updated_at = 5000 WHERE id = 'b1'");
		const write = writeBookPosition(new QueryClient(), {
			bookId: "b1",
			seriesId: null,
			word: 150,
			baseRev: 1000,
		});
		expect(await write.outcome).toEqual({
			kind: "stale",
			row: { wordPosition: 400, updatedAt: 5000 },
		});
		expect(row().word_position).toBe(400);
		expect(readPendingPosition("b1")).toBeNull();
	});

	it("keeps the pending mirror and tells the user when the DB write throws", async () => {
		const spy = vi.spyOn(queries, "writeReaderPosition").mockRejectedValueOnce(new Error("busy"));
		const write = writeBookPosition(new QueryClient(), {
			bookId: "b1",
			seriesId: null,
			word: 170,
			baseRev: 1000,
		});
		expect(await write.outcome).toEqual({ kind: "failed" });
		expect(readPendingPosition("b1")?.word).toBe(170);
		expect(toast.error).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it("updates the cached library row at once", () => {
		const qc = new QueryClient();
		qc.setQueryData(bookKeys.all, {
			books: [{ id: "b1", wordPosition: 100, lastRead: 1000 }],
			covers: new Map(),
		});
		void writeBookPosition(qc, { bookId: "b1", seriesId: null, word: 180, baseRev: 1000 }).outcome;
		const cached = qc.getQueryData<{ books: { wordPosition: number; lastRead: number }[] }>(
			bookKeys.all,
		);
		expect(cached?.books[0].wordPosition).toBe(180);
		expect(cached?.books[0].lastRead).toBeGreaterThan(1000);
	});
});

describe("requestSyncPush", () => {
	it("debounces by default and pushes at once when asked", () => {
		requestSyncPush();
		requestSyncPush(0);
		expect(sync.scheduleSyncPush.mock.calls).toEqual([[5000], [0]]);
	});
});
