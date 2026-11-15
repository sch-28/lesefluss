import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";

let stats: unknown;
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: { useStatsBook: () => ({ data: stats }) },
}));

const { BookFileCard } = await import("../book-file-card");

const DAY = 86_400_000;
const added = Date.UTC(2026, 2, 1);
const book = makeBook({ addedAt: added, finishedAt: added + 20 * DAY, wordCount: 312_000 });

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const labels = () =>
	[...(view?.container.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent);

describe("BookFileCard", () => {
	it("leaves the dates to the journey once the book has one", async () => {
		stats = { firstReadAt: added + DAY, lastReadAt: added + 19 * DAY };
		view = await render(<BookFileCard book={book} chapterCount={0} />);
		expect(labels()).not.toContain("Added");
		expect(labels()).not.toContain("Finished");
		expect(view.text()).toContain("312,000 words");
	});

	it("shows the dates itself while the book has no journey", async () => {
		stats = { firstReadAt: null, lastReadAt: null };
		view = await render(<BookFileCard book={{ ...book, finishedAt: null }} chapterCount={0} />);
		expect(labels()).toContain("Added");
		expect(labels()).not.toContain("Finished");
	});
});
