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
vi.mock("../../../components/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("../../../services/telemetry", () => ({
	reportEvent: vi.fn(),
	errorMessage: (e: unknown) => String(e),
}));

const { createBurstPosition } = await import("../burst-position");
const { readPendingPosition } = await import("../../reader/pending-position");
const { isOwnRevision } = await import("../../../services/position-revisions");
const { bookKeys } = await import("../../../services/db/hooks/query-keys");

const row = () =>
	raw.prepare("SELECT word_position, updated_at FROM books WHERE id = 'b1'").get() as {
		word_position: number;
		updated_at: number;
	};

function setup(canAdopt = false) {
	const qc = new QueryClient();
	const invalidate = vi.spyOn(qc, "invalidateQueries");
	const onAdopt = vi.fn();
	const position = createBurstPosition({
		qc,
		bookId: "b1",
		seriesId: null,
		canAdoptRemote: () => canAdopt,
		onAdopt,
	});
	position.seed({ wordPosition: 100, updatedAt: 1000 });
	return { position, onAdopt, invalidate };
}

beforeEach(() => {
	store.clear();
	vi.clearAllMocks();
	raw.exec("DELETE FROM books");
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at, last_read)
			 VALUES ('b1', 'Book', 'epub', 1, 100, 1000, 0, 500, 0, 1000, 1000, 1000)`,
		)
		.run();
});

describe("burst position", () => {
	it("writes nothing for the word the row already holds", async () => {
		const { position } = setup();
		expect(await position.save(100)).toBe("unchanged");
		expect(row().updated_at).toBe(1000);
		expect(sync.scheduleSyncPush).not.toHaveBeenCalled();
	});

	it("still pushes at once on hide when the word is already saved", async () => {
		const { position } = setup();
		expect(await position.save(100, { pushNow: true })).toBe("unchanged");
		expect(sync.scheduleSyncPush).toHaveBeenCalledWith(0);
	});

	it("saves the word read to, pushes it and tells an open reader through the book query", async () => {
		const { position, invalidate } = setup();
		expect(await position.save(240, { pushNow: true })).toBe("written");
		expect(row().word_position).toBe(240);
		expect(sync.scheduleSyncPush).toHaveBeenCalledWith(0);
		expect(invalidate).toHaveBeenCalledWith({ queryKey: bookKeys.detail("b1") });
		// Not the reader's own revision, so the reader adopts it as external.
		expect(isOwnRevision("b1", row().updated_at)).toBe(false);
		expect(position.baseRev()).toBe(row().updated_at);
	});

	it("builds each save on the last, so a second save lands too", async () => {
		const { position } = setup();
		await position.save(200);
		expect(await position.save(300)).toBe("written");
		expect(row().word_position).toBe(300);
	});

	it("pushes on hide only after the write still in flight has landed", async () => {
		const { position } = setup();
		const playing = position.save(200);
		const hidden = position.save(200, { pushNow: true });
		expect(await playing).toBe("written");
		expect(await hidden).toBe("unchanged");
		expect(sync.scheduleSyncPush.mock.calls).toEqual([[5000], [0]]);
	});

	it("retries on hide a word whose write in flight failed, and reports the retry", async () => {
		let failures = 1;
		raw.function("fail_once", () => (failures-- > 0 ? 1 : 0));
		raw.exec(
			"CREATE TRIGGER fail_write BEFORE UPDATE ON books WHEN fail_once() BEGIN SELECT RAISE(ABORT, 'disk'); END",
		);
		try {
			const { position } = setup();
			const playing = position.save(200);
			const hidden = position.save(200, { pushNow: true });
			expect(await playing).toBe("failed");
			expect(await hidden).toBe("written");
			expect(row().word_position).toBe(200);
		} finally {
			raw.exec("DROP TRIGGER fail_write");
		}
	});

	it("mirrors the word at once, before a queued write starts", async () => {
		const { position } = setup();
		const first = position.save(200);
		const second = position.save(210);
		expect(readPendingPosition("b1")?.word).toBe(210);
		await first;
		expect(readPendingPosition("b1")?.word).toBe(210);
		expect(await second).toBe("written");
		expect(row().word_position).toBe(210);
	});

	it("takes over a newer synced row while the late-sync window is open", async () => {
		raw.exec("UPDATE books SET word_position = 700, updated_at = 5000 WHERE id = 'b1'");
		const { position, onAdopt } = setup(true);
		expect(await position.save(110)).toBe("adopted");
		expect(onAdopt).toHaveBeenCalledWith({ wordPosition: 700, updatedAt: 5000 });
		expect(row().word_position).toBe(700);
		// Adopted, the row's word needs no write of its own.
		expect(await position.save(700)).toBe("unchanged");
	});

	it("does not write over a row it adopted while the hide's save waited", async () => {
		raw.exec("UPDATE books SET word_position = 700, updated_at = 5000 WHERE id = 'b1'");
		const { position, onAdopt } = setup(true);
		const paused = position.save(102);
		const hidden = position.save(102, { pushNow: true });
		expect(await paused).toBe("adopted");
		expect(await hidden).toBe("unchanged");
		expect(onAdopt).toHaveBeenCalledOnce();
		expect(row()).toEqual({ word_position: 700, updated_at: 5000 });
	});

	it("keeps its own word over a newer row once the window has closed", async () => {
		raw.exec("UPDATE books SET word_position = 700, updated_at = 5000 WHERE id = 'b1'");
		const { position, onAdopt } = setup(false);
		expect(await position.save(260)).toBe("written");
		expect(onAdopt).not.toHaveBeenCalled();
		expect(row().word_position).toBe(260);
		expect(row().updated_at).toBeGreaterThan(5000);
	});
});
