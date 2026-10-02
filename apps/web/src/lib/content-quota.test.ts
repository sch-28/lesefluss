import type { SyncBook } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	contentQuotaBytes,
	DEFAULT_CONTENT_QUOTA_BYTES,
	planContentQuota,
	type StoredBlobBytes,
} from "./content-quota";

function book(bookId: string, overrides: Partial<SyncBook> = {}): SyncBook {
	return {
		bookId,
		title: "T",
		author: null,
		fileSize: 0,
		wordCount: null,
		wordPosition: 0,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1,
		...overrides,
	};
}

function stored(content: number, overrides: Partial<StoredBlobBytes> = {}): StoredBlobBytes {
	return { deleted: false, content, coverImage: 0, chapters: 0, linkRanges: 0, ...overrides };
}

const none = new Map<string, StoredBlobBytes>();

describe("planContentQuota", () => {
	it("admits a new book that lands exactly at the cap", () => {
		const plan = planContentQuota([book("aaaaaaaa", { content: "x".repeat(10) })], none, 90, 100);
		expect(plan.rejected.size).toBe(0);
		expect(plan.usedBytes).toBe(100);
	});

	it("rejects a new book one byte over the cap and keeps usage unchanged", () => {
		const plan = planContentQuota([book("aaaaaaaa", { content: "x".repeat(11) })], none, 90, 100);
		expect([...plan.rejected]).toEqual(["aaaaaaaa"]);
		expect(plan.usedBytes).toBe(90);
	});

	it("measures UTF-8 bytes, not string length", () => {
		const plan = planContentQuota([book("aaaaaaaa", { content: "ää" })], none, 97, 100);
		expect(plan.rejected.size).toBe(1);
	});

	it("counts cover and chapters alongside content", () => {
		const plan = planContentQuota(
			[book("aaaaaaaa", { content: "x".repeat(5), coverImage: "c".repeat(5), chapters: "[]" })],
			none,
			90,
			100,
		);
		expect(plan.rejected.size).toBe(1);
	});

	it("counts only the difference when a stored book's content is replaced", () => {
		const plan = planContentQuota(
			[book("aaaaaaaa", { content: "x".repeat(60) })],
			new Map([["aaaaaaaa", stored(50)]]),
			90,
			100,
		);
		expect(plan.rejected.size).toBe(0);
		expect(plan.usedBytes).toBe(100);
	});

	it("keeps stored values for fields the push leaves out", () => {
		const plan = planContentQuota(
			[book("aaaaaaaa", { coverImage: "c".repeat(10) })],
			new Map([["aaaaaaaa", stored(80)]]),
			80,
			100,
		);
		expect(plan.rejected.size).toBe(0);
		expect(plan.usedBytes).toBe(90);
	});

	it("lets a delete in the same push make room for a new book", () => {
		const plan = planContentQuota(
			[book("bbbbbbbb", { content: "x".repeat(40) }), book("aaaaaaaa", { deleted: true })],
			new Map([["aaaaaaaa", stored(50)]]),
			100,
			100,
		);
		expect(plan.rejected.size).toBe(0);
		expect(plan.usedBytes).toBe(90);
	});

	it("admits growing books in payload order while they fit", () => {
		const plan = planContentQuota(
			[
				book("aaaaaaaa", { content: "x".repeat(30) }),
				book("bbbbbbbb", { content: "x".repeat(30) }),
				book("cccccccc", { content: "x".repeat(10) }),
			],
			none,
			50,
			100,
		);
		expect([...plan.rejected]).toEqual(["bbbbbbbb"]);
		expect(plan.usedBytes).toBe(90);
	});

	it("does not let repeated entries for one book free space the row keeps", () => {
		const plan = planContentQuota(
			[
				book("aaaaaaaa", { content: "" }),
				book("aaaaaaaa", { content: "", description: null }),
				book("aaaaaaaa", { content: "x".repeat(50), hideFromProfile: false }),
				book("bbbbbbbb", { content: "x".repeat(50) }),
			],
			new Map([["aaaaaaaa", stored(50)]]),
			100,
			100,
		);
		expect([...plan.rejected]).toEqual(["bbbbbbbb"]);
		expect(plan.usedBytes).toBe(100);
	});

	it("never charges a tombstoned row or a chapter row", () => {
		const plan = planContentQuota(
			[
				book("aaaaaaaa", { content: "x".repeat(50) }),
				book("bbbbbbbb", { content: "x".repeat(50), seriesId: "s1" }),
			],
			new Map([["aaaaaaaa", stored(0, { deleted: true })]]),
			100,
			100,
		);
		expect(plan.rejected.size).toBe(0);
	});
});

describe("contentQuotaBytes", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("defaults to 500 MB", () => {
		vi.stubEnv("SYNC_CONTENT_QUOTA_BYTES", "");
		expect(contentQuotaBytes()).toBe(DEFAULT_CONTENT_QUOTA_BYTES);
	});

	it("takes a positive integer override from the environment", () => {
		vi.stubEnv("SYNC_CONTENT_QUOTA_BYTES", "1234");
		expect(contentQuotaBytes()).toBe(1234);
	});

	it("ignores a malformed override", () => {
		vi.stubEnv("SYNC_CONTENT_QUOTA_BYTES", "lots");
		expect(contentQuotaBytes()).toBe(DEFAULT_CONTENT_QUOTA_BYTES);
	});
});
