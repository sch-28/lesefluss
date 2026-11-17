import { afterEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../services/db/schema";
import { type Rendered, render } from "../../test/render";

vi.mock("../../services/db/hooks", () => ({
	queryHooks: { useBooks: () => ({ data: { covers: new Map() } }) },
}));

const { default: BookCover } = await import("../book-cover");

const book = { id: "b1", title: "Dune", author: "Frank Herbert" } as Book;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("BookCover", () => {
	it("stands in a tinted cover without the title, which the card prints already", async () => {
		view = await render(<BookCover book={book} size="full" />);
		const cover = view.container.querySelector("[data-testid=tinted-cover]");
		expect(cover).not.toBeNull();
		expect(cover?.textContent).toBe("");
		expect(cover?.querySelector("svg")?.getAttribute("class")).toContain("size-6");
	});

	it("shrinks the glyph on a small cover", async () => {
		view = await render(<BookCover book={book} size="sm" />);
		const glyph = view.container.querySelector("[data-testid=tinted-cover] svg");
		expect(glyph?.getAttribute("class")).toContain("size-4");
	});
});
