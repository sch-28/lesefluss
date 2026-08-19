import { type SyncBook, SyncBookSchema, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Book } from "../../db/schema";
import { buildBookMergeUpdate } from "../index";

function makeLocal(overrides: Partial<Book> = {}): Book {
	return {
		id: "deadbeef",
		title: "Local title",
		author: "Local author",
		fileFormat: "txt",
		filePath: null,
		size: 0,
		wordPosition: wordPos(10),
		wordCount: 100,
		isActive: false,
		addedAt: 1000,
		updatedAt: 1000,
		metadataUpdatedAt: 1000,
		lastRead: null,
		finishedAt: null,
		description: "Local description",
		language: "en",
		status: "reading",
		rating: 3,
		review: "Local review",
		tags: '["local"]',
		source: null,
		catalogId: null,
		sourceUrl: null,
		deleted: false,
		seriesId: null,
		chapterIndex: null,
		chapterSourceUrl: null,
		chapterStatus: "fetched",
		chapterError: null,
		...overrides,
	};
}

/** Ties with makeLocal on both stamps, so every case has to say which gate it
 *  means to open. */
function makeServer(overrides: Partial<SyncBook> = {}): SyncBook {
	return {
		bookId: "deadbeef",
		title: "Local title",
		author: "Local author",
		fileSize: 0,
		wordCount: 100,
		wordPosition: 10,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1000,
		metadataUpdatedAt: 1000,
		...overrides,
	};
}

const METADATA_KEYS = ["description", "language", "status", "rating", "review", "tags"] as const;

describe("buildBookMergeUpdate", () => {
	it("returns null when neither stamp is newer", () => {
		expect(buildBookMergeUpdate(makeLocal(), makeServer())).toBeNull();
		expect(
			buildBookMergeUpdate(
				makeLocal({ updatedAt: 3000, metadataUpdatedAt: 3000 }),
				makeServer({ updatedAt: 2000, metadataUpdatedAt: 2000 }),
			),
		).toBeNull();
	});

	it("applies newer metadata from another device", () => {
		const update = buildBookMergeUpdate(
			makeLocal(),
			makeServer({
				metadataUpdatedAt: 2000,
				title: "Edited elsewhere",
				author: "Edited author",
				description: "Edited description",
				language: "de",
				status: "dropped",
				rating: 10,
				review: "Edited review",
				tags: '["scifi","favorites"]',
			}),
		);
		expect(update).toMatchObject({
			title: "Edited elsewhere",
			author: "Edited author",
			description: "Edited description",
			language: "de",
			status: "dropped",
			rating: 10,
			review: "Edited review",
			tags: '["scifi","favorites"]',
			metadataUpdatedAt: 2000,
		});
	});

	it("writes an explicit clear", () => {
		const update = buildBookMergeUpdate(
			makeLocal(),
			makeServer({ metadataUpdatedAt: 2000, rating: null, tags: null }),
		);
		expect(update).toMatchObject({ rating: null, tags: null });
	});

	// A client built before these columns existed omits them entirely. Absent is
	// not "cleared": treating it as such would wipe metadata every time an older
	// device pushed a newer reading position.
	it("leaves metadata alone when the payload omits it", () => {
		const legacyPayload = SyncBookSchema.parse({
			bookId: "deadbeef",
			title: "Local title",
			author: "Local author",
			fileSize: 0,
			wordCount: 100,
			wordPosition: 42,
			updatedAt: 2000,
		});
		const update = buildBookMergeUpdate(makeLocal(), legacyPayload);
		expect(update?.wordPosition).toBe(42);
		for (const key of METADATA_KEYS) expect(update).not.toHaveProperty(key);
	});
});

// The add date is a fact about the book rather than a revision of it, so it
// merges on its own value. A device that restored the library carries the
// pushing device's clock in `added_at`, and has to be able to recover the
// original from a device that still holds it.
describe("buildBookMergeUpdate: the add date merges earliest-wins", () => {
	it("adopts an earlier add date even when neither stamp is newer", () => {
		const update = buildBookMergeUpdate(
			makeLocal({ addedAt: 5000 }),
			makeServer({ addedAt: 1000 }),
		);
		expect(update).toEqual({ addedAt: 1000 });
	});

	it("ignores a later one", () => {
		expect(
			buildBookMergeUpdate(makeLocal({ addedAt: 1000 }), makeServer({ addedAt: 5000 })),
		).toBeNull();
	});

	it("ignores a payload that does not carry the field", () => {
		expect(buildBookMergeUpdate(makeLocal({ addedAt: 5000 }), makeServer())).toBeNull();
	});

	it("converges whichever device pulls first", () => {
		const first = buildBookMergeUpdate(makeLocal({ addedAt: 5000 }), makeServer({ addedAt: 1000 }));
		const second = buildBookMergeUpdate(
			makeLocal({ addedAt: first?.addedAt ?? 5000 }),
			makeServer({ addedAt: 1000 }),
		);
		expect(first?.addedAt).toBe(1000);
		expect(second).toBeNull();
	});

	it("does not move a revision stamp on its own", () => {
		const update = buildBookMergeUpdate(
			makeLocal({ addedAt: 5000 }),
			makeServer({ addedAt: 1000 }),
		);
		expect(update).not.toHaveProperty("updatedAt");
		expect(update).not.toHaveProperty("metadataUpdatedAt");
		expect(update).not.toHaveProperty("wordPosition");
	});
});

// `updated_at` is the reading position's revision and nothing else, because
// every released build reads it that way and adopts the server's position
// whenever it is higher. The reader-editable fields carry their own stamp.
describe("buildBookMergeUpdate: the two gates are independent", () => {
	it("does not touch the position when only metadata is newer", () => {
		const update = buildBookMergeUpdate(
			makeLocal({ wordPosition: wordPos(5000), lastRead: 900 }),
			makeServer({ wordPosition: 10, metadataUpdatedAt: 2000, rating: 10 }),
		);
		expect(update?.rating).toBe(10);
		expect(update).not.toHaveProperty("wordPosition");
		expect(update).not.toHaveProperty("lastRead");
		expect(update).not.toHaveProperty("updatedAt");
	});

	// The regression this whole split exists for, from the far side: a metadata
	// edit must never present itself to anyone as a newer reading position.
	it("ignores a metadata edit that leaves the position stamp alone", () => {
		const local = makeLocal({ wordPosition: wordPos(5000), updatedAt: 2000 });
		const update = buildBookMergeUpdate(
			local,
			makeServer({ wordPosition: 100, updatedAt: 2000, metadataUpdatedAt: 3000, rating: 8 }),
		);
		expect(update?.rating).toBe(8);
		expect(update).not.toHaveProperty("wordPosition");
	});

	it("does not touch metadata when only the position is newer", () => {
		const update = buildBookMergeUpdate(
			makeLocal(),
			makeServer({ wordPosition: 5000, updatedAt: 3000, rating: 10 }),
		);
		expect(update?.wordPosition).toBe(5000);
		expect(update?.updatedAt).toBe(3000);
		expect(update?.lastRead).toBe(3000);
		for (const key of METADATA_KEYS) expect(update).not.toHaveProperty(key);
	});

	it("applies both when both are newer", () => {
		const update = buildBookMergeUpdate(
			makeLocal(),
			makeServer({ wordPosition: 5000, updatedAt: 3000, metadataUpdatedAt: 3000, rating: 10 }),
		);
		expect(update?.wordPosition).toBe(5000);
		expect(update?.rating).toBe(10);
	});

	// `commitChapter` moves lastRead without the position, so the server's
	// revision can trail ours. Regressing it re-sorts the library by recency.
	it("never moves lastRead backwards", () => {
		const update = buildBookMergeUpdate(
			makeLocal({ lastRead: 9000 }),
			makeServer({ wordPosition: 300, updatedAt: 5000 }),
		);
		expect(update?.wordPosition).toBe(300);
		expect(update?.lastRead).toBe(9000);
	});

	it("falls back to the row revision when the payload carries no metadata stamp", () => {
		const legacy = makeServer({ updatedAt: 4000, rating: 10 });
		delete legacy.metadataUpdatedAt;
		const update = buildBookMergeUpdate(makeLocal(), legacy);
		expect(update?.rating).toBe(10);
		expect(update?.metadataUpdatedAt).toBe(4000);
	});

	it("refreshes wordCount alongside a newer position", () => {
		const update = buildBookMergeUpdate(
			makeLocal({ wordCount: 100 }),
			makeServer({ wordPosition: 50, wordCount: 250, updatedAt: 3000 }),
		);
		expect(update?.wordCount).toBe(250);
	});
});
