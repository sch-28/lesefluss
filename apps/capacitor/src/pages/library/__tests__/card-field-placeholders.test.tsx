import { afterEach, describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { BookFieldLines, cardStatus, StatusField, TimeToReadField } from "../card-fields";

let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

describe("card status line", () => {
	it("an unread book has no status line; its time to read is a field of its own", async () => {
		rendered = await render(<StatusField status={{ kind: "unread", minutes: 300 }} />);
		expect(rendered.text()).toBe("");
		await rendered.rerender(<TimeToReadField minutes={300} />);
		expect(rendered.text()).toBe("5h read");
	});

	it("shows time to read only when picked, only for an unread book with an estimate", async () => {
		const lines = async (
			fields: Parameters<typeof BookFieldLines>[0]["fields"],
			status: Parameters<typeof BookFieldLines>[0]["status"],
		) => {
			rendered?.unmount();
			rendered = await render(
				<div>
					<BookFieldLines
						surface="grid"
						fields={fields}
						book={{ author: "George Eliot", rating: null }}
						status={status}
					/>
				</div>,
			);
			return rendered.text();
		};
		const unread = { kind: "unread", minutes: 300 } as const;
		expect(await lines(["author", "progress"], unread)).toBe("George Eliot");
		expect(await lines(["author", "timeToRead", "progress"], unread)).toBe("George Eliot5h read");
		expect(await lines(["timeToRead"], { kind: "unread", minutes: null })).toBe("");
		expect(await lines(["timeToRead", "progress"], { kind: "reading", progress: 42 })).toBe("42%");
		expect(await lines(["timeToRead", "progress"], { kind: "finished" })).toBe("Finished");
	});

	it("a book in progress shows its percent, a finished one Finished", async () => {
		rendered = await render(<StatusField status={{ kind: "reading", progress: 42 }} />);
		expect(rendered.text()).toBe("42%");
		await rendered.rerender(<StatusField status={{ kind: "finished" }} />);
		expect(rendered.text()).toBe("Finished");
	});

	it("derives the status from the book", () => {
		const fresh = makeBook({ wordCount: 1000 });
		expect(cardStatus(fresh, 120)).toEqual({ kind: "unread", minutes: 120 });
		expect(cardStatus(fresh, 0)).toEqual({ kind: "unread", minutes: null });
		expect(cardStatus(makeBook({ finishedAt: 1 }), 0)).toEqual({ kind: "finished" });
	});
});
