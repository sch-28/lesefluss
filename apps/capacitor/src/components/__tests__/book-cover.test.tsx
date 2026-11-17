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
	it("keeps room at the text cover's bottom for a badge over it", async () => {
		view = await render(<BookCover book={book} size="full" textCoverClassName="pb-7" />);
		expect(view.container.querySelector("[data-testid=text-cover]")?.classList).toContain("pb-7");
	});
});
