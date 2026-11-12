import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import type { Highlight } from "../../db/schema";

const state = vi.hoisted(() => ({
	isWeb: true,
	writeFile: vi.fn(),
	getUri: vi.fn(),
	share: vi.fn(),
	highlights: [] as unknown[],
}));

vi.mock("../../../utils/platform", () => ({
	get IS_WEB() {
		return state.isWeb;
	},
}));
vi.mock("@capacitor/filesystem", () => ({
	Directory: { Cache: "CACHE" },
	Encoding: { UTF8: "utf8" },
	Filesystem: { writeFile: state.writeFile, getUri: state.getUri },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: state.share } }));
vi.mock("../../db/queries/books", () => ({
	getAllBooks: async () => [makeBook({ id: "b1", title: "Morning Star" })],
}));
vi.mock("../../db/queries/series", () => ({
	getSeriesList: async () => [],
	getSeriesChapters: async () => [],
}));
vi.mock("../../db/queries/highlights", () => ({
	getAllHighlights: async () => state.highlights,
	getHighlightsByBook: async () => state.highlights,
	getHighlightsByBooks: async () => state.highlights,
}));

const { exportHighlights } = await import("../index");

const BOOK_MARKDOWN = { format: "markdown", scope: { type: "book", id: "b1" } } as const;

beforeEach(() => {
	state.isWeb = true;
	state.highlights = [
		{
			id: "h1",
			bookId: "b1",
			startWord: 0,
			startCharInWord: 0,
			text: "Break the chains",
			note: null,
			color: "yellow",
		} as Partial<Highlight>,
	];
	state.writeFile.mockReset().mockResolvedValue({});
	state.getUri.mockReset().mockResolvedValue({ uri: "file:///cache/Morning Star.md" });
	state.share.mockReset().mockResolvedValue({});
	URL.createObjectURL = vi.fn(() => "blob:md");
	URL.revokeObjectURL = vi.fn();
});

describe("exportHighlights", () => {
	it("downloads the book's Markdown file in the browser", async () => {
		const clicked: string[] = [];
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
			this: HTMLAnchorElement,
		) {
			clicked.push(this.download);
		});
		expect(await exportHighlights(BOOK_MARKDOWN)).toBe(true);
		expect(clicked).toEqual(["Morning Star.md"]);
		expect(state.share).not.toHaveBeenCalled();
		click.mockRestore();
	});

	it("hands the file to the native share sheet on Android", async () => {
		state.isWeb = false;
		expect(await exportHighlights(BOOK_MARKDOWN)).toBe(true);
		expect(state.writeFile).toHaveBeenCalledWith(
			expect.objectContaining({ path: "Morning Star.md", directory: "CACHE" }),
		);
		expect(state.writeFile.mock.calls[0][0].data).toContain("> Break the chains");
		expect(state.share).toHaveBeenCalledWith(
			expect.objectContaining({ files: ["file:///cache/Morning Star.md"] }),
		);
	});

	it("reports a dismissed share sheet as not exported, not as an error", async () => {
		state.isWeb = false;
		state.share.mockRejectedValue(new Error("Share canceled"));
		expect(await exportHighlights(BOOK_MARKDOWN)).toBe(false);
	});

	it("still fails on a real share error", async () => {
		state.isWeb = false;
		state.share.mockRejectedValue(new Error("No app can handle this"));
		await expect(exportHighlights(BOOK_MARKDOWN)).rejects.toThrow("No app can handle this");
	});
});
