import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { NextChapterFooter } from "../next-chapter-footer";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const noop = () => undefined;

describe("NextChapterFooter", () => {
	it("shows the next chapter's reading time on the Next button", async () => {
		view = await render(
			<NextChapterFooter hasPrev hasNext onNext={noop} onPrev={noop} nextMinutes={12.4} />,
		);
		expect(view.getButton(/Next/).textContent).toBe("Next12 min");
	});

	it("shows no time when the next chapter's length is unknown", async () => {
		view = await render(<NextChapterFooter hasPrev={false} hasNext onNext={noop} onPrev={noop} />);
		expect(view.getButton(/Next/).textContent).toBe("Next");
	});
});
