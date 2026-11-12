import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "../../../services/db/schema";
import { click, type Rendered, render } from "../../../test/render";

const state = vi.hoisted(() => ({ exportHighlights: vi.fn(), showToast: vi.fn() }));

vi.mock("../../../services/export", () => ({ exportHighlights: state.exportHighlights }));
vi.mock("../../../components/toast", () => ({ useToast: () => ({ showToast: state.showToast }) }));

const { BookHighlights } = await import("../book-highlights");

const highlight = {
	id: "h1",
	bookId: "b1",
	startWord: 3,
	color: "yellow",
	text: "Quote",
} as Highlight;

let view: Rendered | undefined;
beforeEach(() => {
	state.exportHighlights.mockReset().mockResolvedValue(true);
	state.showToast.mockReset();
});
afterEach(() => view?.unmount());

describe("BookHighlights export", () => {
	it("offers no export when the book has no highlights", async () => {
		view = await render(<BookHighlights bookId="b1" highlights={[]} />);
		expect(view.queryButton(/Export/)).toBeNull();
	});

	it("exports the book's highlights as Markdown and confirms it", async () => {
		view = await render(<BookHighlights bookId="b1" highlights={[highlight]} />);
		await click(view.getButton("Export highlights as Markdown"));
		expect(state.exportHighlights).toHaveBeenCalledWith({
			format: "markdown",
			scope: { type: "book", id: "b1" },
		});
		expect(state.showToast).toHaveBeenCalledWith("Highlights exported", "success");
	});

	it("stays quiet when the share sheet is dismissed", async () => {
		state.exportHighlights.mockResolvedValue(false);
		view = await render(<BookHighlights bookId="b1" highlights={[highlight]} />);
		await click(view.getButton("Export highlights as Markdown"));
		expect(state.showToast).not.toHaveBeenCalled();
	});

	it("shows the error when the export fails", async () => {
		state.exportHighlights.mockRejectedValue(new Error("Disk full"));
		view = await render(<BookHighlights bookId="b1" highlights={[highlight]} />);
		await click(view.getButton("Export highlights as Markdown"));
		expect(state.showToast).toHaveBeenCalledWith("Disk full", "danger");
	});
});
