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
vi.mock("../../series-collections", () => ({
	applyImportSeriesChoice: vi.fn(async () => {}),
	scheduleSeriesReconcile: vi.fn(async () => {}),
}));
vi.mock("../../telemetry", () => ({ reportEvent: vi.fn(), errorMessage: String }));
vi.mock("../store-images", () => ({ storeBookImages: vi.fn(async () => 0) }));

const { commitBook } = await import("../commit");
const { applyImportSeriesChoice, scheduleSeriesReconcile } = await import(
	"../../series-collections"
);

const payload: BookPayload = {
	content: "body text",
	title: "Leviathan Wakes",
	author: "James S. A. Corey",
	fileFormat: "epub",
};

describe("commitBook", () => {
	beforeEach(() => {
		vi.mocked(scheduleSeriesReconcile).mockClear();
		vi.mocked(applyImportSeriesChoice).mockReset();
	});

	it("reconciles series collections when the import names a series", async () => {
		await commitBook({ ...payload, seriesName: "The Expanse", seriesIndex: 1 }, {});
		expect(scheduleSeriesReconcile).toHaveBeenCalledTimes(1);
	});

	it("leaves series collections alone for a book without a series", async () => {
		await commitBook(payload, {});
		expect(scheduleSeriesReconcile).not.toHaveBeenCalled();
		expect(applyImportSeriesChoice).not.toHaveBeenCalled();
	});

	it("writes the series choice before the reconcile, which must find it", async () => {
		const order: string[] = [];
		vi.mocked(applyImportSeriesChoice).mockImplementation(async () => {
			order.push("choice");
		});
		vi.mocked(scheduleSeriesReconcile).mockImplementationOnce(async () => {
			order.push("reconcile");
		});
		const book = await commitBook(
			{ ...payload, seriesName: "The Expanse", seriesIndex: 1 },
			{},
			undefined,
			{ series: { kind: "none" } },
		);
		expect(applyImportSeriesChoice).toHaveBeenCalledWith(
			book.id,
			{ seriesName: "The Expanse", seriesIndex: 1 },
			{ kind: "none" },
		);
		expect(order).toEqual(["choice", "reconcile"]);
	});

	it("still adds the book when the series choice fails", async () => {
		vi.mocked(applyImportSeriesChoice).mockRejectedValueOnce(new Error("disk full"));
		const book = await commitBook(payload, {}, undefined, {
			series: { kind: "new", name: "Mine", index: 1 },
		});
		expect(book.id).toBeTruthy();
	});
});
