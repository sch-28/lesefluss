import { afterEach, describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { cardStatus, StatusField } from "../card-fields";

let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

describe("card status line", () => {
	it("an unread book shows its time to read, or New without an estimate", async () => {
		rendered = await render(<StatusField status={{ kind: "unread", minutes: 300 }} />);
		expect(rendered.text()).toBe("5h read");
		await rendered.rerender(<StatusField status={{ kind: "unread", minutes: null }} />);
		expect(rendered.text()).toBe("New");
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
