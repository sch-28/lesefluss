import { seriesCollectionId } from "@lesefluss/core";
import { describe, expect, it, vi } from "vitest";
import type { Collection, CollectionBook } from "../db/schema";

vi.mock("../db/queries", () => ({ queries: {} }));
vi.mock("../sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../query-client", () => ({ queryClient: { invalidateQueries: vi.fn() } }));

const { AUTO_STAMP, planSeriesReconcile, scheduleSeriesReconcile } = await import(
	"../series-collections"
);
const { queries } = await import("../db/queries");
const { buildCollectionMerge } = await import("../sync/collection-sync");
type HintBook = Parameters<typeof planSeriesReconcile>[0]["books"][number];

const EXPANSE = seriesCollectionId("the expanse");

function book(id: string, addedAt: number, seriesName: string | null, seriesIndex: number | null) {
	return { id, addedAt, seriesName, seriesIndex } satisfies HintBook;
}

const one = book("aaaaaaaa", 100, "The Expanse", 1);
const two = book("bbbbbbbb", 200, "the  expanse!", 2);
const three = book("cccccccc", 300, "THE EXPANSE", 3);

function plan(
	books: HintBook[],
	collections: Collection[] = [],
	memberships: CollectionBook[] = [],
) {
	return planSeriesReconcile({ books, collections, memberships, now: 10_000 });
}

/** A device's rows after it pulls `server` and upserts what the merge returns. */
function afterPull(
	local: { collections: Collection[]; memberships: CollectionBook[] },
	server: { collections: Collection[]; memberships: CollectionBook[] },
) {
	const merge = buildCollectionMerge(
		{ collections: local.collections, collectionBooks: local.memberships },
		{
			collections: server.collections.map((c) => ({ ...c, collectionId: c.id })),
			collectionBooks: server.memberships,
		},
	);
	const collections = new Map(local.collections.map((c) => [c.id, c]));
	for (const c of merge.collections) collections.set(c.id, c);
	const memberships = new Map(local.memberships.map((m) => [m.bookId, m]));
	for (const m of merge.collectionBooks) memberships.set(m.bookId, m);
	return { collections: [...collections.values()], memberships: [...memberships.values()] };
}

describe("planSeriesReconcile", () => {
	it("creates nothing for a lone book", () => {
		expect(plan([one])).toEqual({ collections: [], memberships: [] });
	});

	it("creates one ordered collection for two books whose hints differ only in case and punctuation", () => {
		const result = plan([two, one]);
		expect(result.collections).toEqual([
			{
				id: EXPANSE,
				name: "The Expanse",
				sortOrder: 100,
				ordered: true,
				seriesKey: "the expanse",
				deleted: false,
				createdAt: 100,
				updatedAt: AUTO_STAMP,
			},
		]);
		expect(result.memberships).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ bookId: "aaaaaaaa", seriesIndex: 1, updatedAt: AUTO_STAMP }),
				expect.objectContaining({ bookId: "bbbbbbbb", seriesIndex: 2, updatedAt: AUTO_STAMP }),
			]),
		);
		expect(result.memberships).toHaveLength(2);
	});

	it("lets a third book join the existing collection, even after a rename", () => {
		const first = plan([one, two]);
		const renamed = { ...first.collections[0], name: "My Expanse", updatedAt: 9_000 };
		const result = plan([one, two, three], [renamed], first.memberships);
		expect(result.collections).toEqual([]);
		expect(result.memberships).toEqual([
			{
				collectionId: EXPANSE,
				bookId: "cccccccc",
				seriesIndex: 3,
				position: null,
				deleted: false,
				updatedAt: AUTO_STAMP,
			},
		]);
	});

	it("keeps a leading article apart and ignores books without a hint", () => {
		const bare = book("dddddddd", 400, "Expanse", 4);
		const none = book("eeeeeeee", 500, null, null);
		const result = plan([one, bare, none]);
		expect(result).toEqual({ collections: [], memberships: [] });
	});

	it("drops a series number the wire would refuse", () => {
		const result = plan([one, book("ffffffff", 200, "The Expanse", -1)]);
		expect(result.memberships.find((m) => m.bookId === "ffffffff")?.seriesIndex).toBeNull();
	});
});

describe("two devices that create the same series offline", () => {
	it("end with one collection holding the union of their books", () => {
		const deviceA = plan([one, two]);
		const deviceB = plan([one, three]);
		const synced = afterPull(deviceA, deviceB);
		expect(synced.collections.map((c) => c.id)).toEqual([EXPANSE]);
		expect(synced.memberships.map((m) => m.bookId).sort()).toEqual([
			"aaaaaaaa",
			"bbbbbbbb",
			"cccccccc",
		]);
	});
});

describe("dismissals", () => {
	const created = plan([one, two]);

	it("never re-adds a book the user removed", () => {
		const removed = created.memberships.map((m) =>
			m.bookId === "bbbbbbbb" ? { ...m, deleted: true, updatedAt: 5_000 } : m,
		);
		expect(plan([one, two], created.collections, removed)).toEqual({
			collections: [],
			memberships: [],
		});
	});

	it("never recreates or fills a series collection the user deleted", () => {
		const deleted = created.collections.map((c) => ({ ...c, deleted: true, updatedAt: 5_000 }));
		expect(plan([one, two, three], deleted, created.memberships)).toEqual({
			collections: [],
			memberships: [],
		});
	});

	it("a removal here beats the auto row of a device that had not seen it", () => {
		const removedHere = {
			collections: created.collections,
			memberships: created.memberships.map((m) =>
				m.bookId === "bbbbbbbb" ? { ...m, deleted: true, updatedAt: 5_000 } : m,
			),
		};
		const synced = afterPull(removedHere, plan([one, two]));
		expect(synced.memberships.find((m) => m.bookId === "bbbbbbbb")?.deleted).toBe(true);
	});

	it("a delete on another device beats a later import on a device that had not seen it", () => {
		const deletedThere = {
			collections: created.collections.map((c) => ({ ...c, deleted: true, updatedAt: 5_000 })),
			memberships: created.memberships.map((m) => ({ ...m, deleted: true, updatedAt: 5_000 })),
		};
		const lateImport = book("cccccccc", 9_000, "The Expanse", 3);
		const offline = plan([one, lateImport]);
		expect(offline.collections[0]?.updatedAt).toBe(AUTO_STAMP);
		const synced = afterPull(offline, deletedThere);
		expect(synced.collections.find((c) => c.id === EXPANSE)?.deleted).toBe(true);
	});

	it("never dates an auto row after the clock, whatever a book's addedAt says", () => {
		const future = [book("aaaaaaaa", 1e15, "Dune", 1), book("bbbbbbbb", 2e15, "Dune", 2)];
		const [collection] = plan(future).collections;
		expect(collection).toMatchObject({
			createdAt: 10_000,
			sortOrder: 10_000,
			updatedAt: AUTO_STAMP,
		});
	});
});

describe("scheduleSeriesReconcile", () => {
	it("queues exactly one more run for calls during a run, and resolves after it", async () => {
		let release: () => void = () => {};
		const firstRead = new Promise<never[]>((resolve) => {
			release = () => resolve([]);
		});
		const reads = vi.fn().mockReturnValueOnce(firstRead).mockResolvedValue([]);
		Object.assign(queries, {
			getSeriesHintBooks: reads,
			getSeriesReconcileRows: async () => ({ collections: [], memberships: [] }),
		});

		const first = scheduleSeriesReconcile();
		const second = scheduleSeriesReconcile();
		const third = scheduleSeriesReconcile();
		expect(second).toBe(first);
		expect(third).toBe(first);
		expect(reads).toHaveBeenCalledTimes(1);

		release();
		await first;
		expect(reads).toHaveBeenCalledTimes(2);

		await scheduleSeriesReconcile();
		expect(reads).toHaveBeenCalledTimes(3);
	});
});
