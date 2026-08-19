// @vitest-environment node
//
// Book upsert merge rules against a real Postgres database. Skipped when
// DATABASE_URL is unset (e.g. CI without a DB) so it never breaks `pnpm test`.
// Run locally with:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp pnpm test sync-book-upsert
import { randomUUID } from "node:crypto";
import type { SyncBook } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { syncBooks } from "~/db/schema";
import {
	bookInsertValues,
	bookUpsertSet,
	bookUpsertSetPreservingMetadata,
	bookUpsertTarget,
	claimsMetadata,
} from "./sync-book-upsert";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sync_books upsert (integration)", () => {
	const userId = `test-upsert-${randomUUID()}`;

	afterAll(async () => {
		await db.delete(syncBooks).where(eq(syncBooks.userId, userId));
	});

	function makeBook(overrides: Partial<SyncBook> = {}): SyncBook {
		return {
			bookId: "deadbeef",
			title: "Original title",
			author: "Original author",
			fileSize: 10,
			wordCount: 100,
			wordPosition: 0,
			chapterStatus: "fetched",
			deleted: false,
			updatedAt: 1_000_000,
			...overrides,
		};
	}

	/** Same routing the sync route performs: a payload that claims nothing about
	 *  the reader-editable columns must not be merged as if it cleared them. */
	async function push(book: SyncBook) {
		await db
			.insert(syncBooks)
			.values(bookInsertValues(userId, book))
			.onConflictDoUpdate({
				target: bookUpsertTarget,
				set: claimsMetadata(book) ? bookUpsertSet : bookUpsertSetPreservingMetadata,
			});
	}

	/** A payload from a client build that pre-dates these columns: it omits them
	 *  rather than sending nulls, and sends no position stamp at all. */
	function makeLegacyBook(overrides: Partial<SyncBook> = {}): SyncBook {
		const {
			description: _d,
			language: _l,
			status: _s,
			rating: _r,
			review: _rv,
			tags: _t,
			metadataUpdatedAt: _p,
			...legacy
		} = makeBook(overrides);
		return legacy;
	}

	async function read(bookId: string) {
		const [row] = await db
			.select()
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
		return row;
	}

	test("a newer push applies reader-edited metadata", async () => {
		await push(makeBook());
		await push(
			makeBook({
				title: "Edited title",
				description: "A blurb",
				status: "dropped",
				rating: 5,
				tags: '["scifi"]',
				updatedAt: 2_000_000,
			}),
		);

		const row = await read("deadbeef");
		expect(row.title).toBe("Edited title");
		expect(row.description).toBe("A blurb");
		expect(row.status).toBe("dropped");
		expect(row.rating).toBe(5);
		expect(row.tags).toBe('["scifi"]');
	});

	test("a stale push does not clobber a newer edit", async () => {
		const bookId = "cafebabe";
		await push(makeBook({ bookId, title: "Edited title", rating: 5, updatedAt: 2_000_000 }));
		// Another device, still holding the pre-edit snapshot.
		await push(makeBook({ bookId, title: "Original title", rating: null, updatedAt: 1_000_000 }));

		const row = await read(bookId);
		expect(row.title).toBe("Edited title");
		expect(row.rating).toBe(5);
		// The row keeps the newer revision so the stale device is the one that
		// gets corrected on its next pull.
		expect(row.updatedAt.getTime()).toBe(2_000_000);
	});

	// The rollout case: an app build that pre-dates these columns omits them, and
	// its derived timestamp ties with the value this row was backfilled to.
	test("a same-timestamp push from a client without the columns erases nothing", async () => {
		const bookId = "0badf00d";
		await push(makeBook({ bookId, description: "A blurb", rating: 4, updatedAt: 1_000_000 }));
		await push(makeLegacyBook({ bookId, updatedAt: 1_000_000 }));

		const row = await read(bookId);
		expect(row.description).toBe("A blurb");
		expect(row.rating).toBe(4);
	});

	// The same client one reading session later. Its revision now genuinely
	// exceeds the server's, so every gate in the set clause lets it through:
	// the columns it has never heard of have to be excluded from the merge
	// entirely, not merely gated.
	test("a NEWER push from a client without the columns erases nothing", async () => {
		const bookId = "feedface";
		await push(
			makeBook({
				bookId,
				description: "A blurb",
				status: "dropped",
				rating: 4,
				review: "Not for me",
				tags: '["scifi"]',
				language: "de",
				updatedAt: 1_000_000,
			}),
		);
		await push(makeLegacyBook({ bookId, wordPosition: 42, updatedAt: 5_000_000 }));

		const row = await read(bookId);
		expect(row.description).toBe("A blurb");
		expect(row.status).toBe("dropped");
		expect(row.rating).toBe(4);
		expect(row.review).toBe("Not for me");
		expect(row.tags).toBe('["scifi"]');
		expect(row.language).toBe("de");
		// The reading position it does know about still merges.
		expect(row.wordPosition).toBe(42);
	});

	// word_position deliberately uses `>=` where the metadata columns use `>`:
	// a tie means two devices at the same revision, and the position is the one
	// field where taking the incoming value costs nothing.
	test("a same-timestamp push still applies the reading position", async () => {
		const bookId = "d15ea5e0";
		await push(makeBook({ bookId, wordPosition: 10, updatedAt: 1_000_000 }));
		await push(makeBook({ bookId, wordPosition: 99, updatedAt: 1_000_000 }));

		const row = await read(bookId);
		expect(row.wordPosition).toBe(99);
	});

	// `updated_at` is the position's revision, so a metadata edit leaves it where
	// it was and cannot present a stale position as the newer one. This is what
	// keeps released builds, which read `updated_at` as the position, safe.
	test("a metadata edit does not drag a stale reading position with it", async () => {
		const bookId = "b0a710ff";
		// The device doing the reading.
		await push(makeBook({ bookId, wordPosition: 5000, updatedAt: 2_000_000 }));
		// A second device, behind on reading, rates the book later. Its position
		// revision is still its own older one; only the metadata stamp moves.
		await push(
			makeBook({
				bookId,
				wordPosition: 1000,
				updatedAt: 1_000_000,
				metadataUpdatedAt: 3_000_000,
				rating: 5,
			}),
		);

		const row = await read(bookId);
		expect(row.wordPosition).toBe(5000);
		expect(row.rating).toBe(5);
	});

	test("a genuine position advance still wins", async () => {
		const bookId = "0ca55e77";
		await push(makeBook({ bookId, wordPosition: 1000, updatedAt: 1_000_000 }));
		await push(makeBook({ bookId, wordPosition: 7000, updatedAt: 2_000_000 }));

		const row = await read(bookId);
		expect(row.wordPosition).toBe(7000);
	});

	// A deployed client knows nothing of the metadata columns but has always
	// meant `updated_at` as the position's revision, so its reading still lands.
	test("a client without the metadata columns still syncs its position", async () => {
		const bookId = "1eaced00";
		await push(makeBook({ bookId, wordPosition: 100, updatedAt: 1_000_000 }));
		await push(makeLegacyBook({ bookId, wordPosition: 4200, updatedAt: 2_000_000 }));

		const row = await read(bookId);
		expect(row.wordPosition).toBe(4200);
	});

	// The add date is a fact about the book, not a revision of it. A device that
	// restored the library stamps itself into `added_at`, and a later push from it
	// must not overwrite the original.
	test("the earliest add date survives a later push", async () => {
		const bookId = "add00001";
		await push(makeBook({ bookId, addedAt: 1_000_000, updatedAt: 1_000_000 }));
		await push(makeBook({ bookId, addedAt: 9_000_000, updatedAt: 2_000_000 }));

		const row = await read(bookId);
		expect(row.addedAt?.getTime()).toBe(1_000_000);
	});

	test("an earlier add date replaces a later stored one", async () => {
		const bookId = "add00002";
		await push(makeBook({ bookId, addedAt: 9_000_000, updatedAt: 1_000_000 }));
		await push(makeBook({ bookId, addedAt: 1_000_000, updatedAt: 2_000_000 }));

		const row = await read(bookId);
		expect(row.addedAt?.getTime()).toBe(1_000_000);
	});

	test("a client without the column leaves the stored add date alone", async () => {
		const bookId = "add00003";
		await push(makeBook({ bookId, addedAt: 1_000_000, updatedAt: 1_000_000 }));
		await push(makeLegacyBook({ bookId, updatedAt: 2_000_000 }));

		const row = await read(bookId);
		expect(row.addedAt?.getTime()).toBe(1_000_000);
	});

	// A deleted book keeps none of the reader's own text. Content, cover and
	// chapters were already cleared; private notes must not outlive the delete.
	test("a tombstone clears the reader's notes", async () => {
		const bookId = "dead0000";
		await push(
			makeBook({
				bookId,
				description: "A blurb",
				review: "Private thoughts",
				tags: '["scifi"]',
				rating: 8,
				updatedAt: 1_000_000,
			}),
		);
		await push(makeBook({ bookId, deleted: true, updatedAt: 2_000_000 }));

		const row = await read(bookId);
		expect(row.deleted).toBe(true);
		expect(row.review).toBeNull();
		expect(row.description).toBeNull();
		expect(row.tags).toBeNull();
		expect(row.rating).toBeNull();
	});
});
