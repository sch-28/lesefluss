import type { BookPayload } from "@lesefluss/book-import";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Data: "DATA" }, Filesystem: {} }));
vi.mock("../../db/queries", () => ({
	queries: {
		addBookWithContent: vi.fn(async () => {}),
		getBook: vi.fn(async (id: string) => ({ id })),
	},
}));
vi.mock("../../series-collections", () => ({ scheduleSeriesReconcile: vi.fn(async () => {}) }));
vi.mock("../store-images", () => ({ storeBookImages: vi.fn(async () => 0) }));

const { commitBook } = await import("../commit");
const { scheduleSeriesReconcile } = await import("../../series-collections");

const payload: BookPayload = {
	content: "body text",
	title: "Leviathan Wakes",
	author: "James S. A. Corey",
	fileFormat: "epub",
};

describe("commitBook", () => {
	beforeEach(() => vi.mocked(scheduleSeriesReconcile).mockClear());

	it("reconciles series collections when the import names a series", async () => {
		await commitBook({ ...payload, seriesName: "The Expanse", seriesIndex: 1 }, {});
		expect(scheduleSeriesReconcile).toHaveBeenCalledTimes(1);
	});

	it("leaves series collections alone for a book without a series", async () => {
		await commitBook(payload, {});
		expect(scheduleSeriesReconcile).not.toHaveBeenCalled();
	});
});
