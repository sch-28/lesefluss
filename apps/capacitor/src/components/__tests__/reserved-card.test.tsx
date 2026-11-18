import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../test/render";
import { ReservedCard } from "../reserved-card";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("ReservedCard", () => {
	it("holds its place with a spinner at the 32px loading tier", async () => {
		view = await render(<ReservedCard isPending height={120} />);
		const spinner = view.container.querySelector('[data-testid="reserved-card"] svg');
		expect(spinner?.getAttribute("class")).toContain("size-8");
	});
});
