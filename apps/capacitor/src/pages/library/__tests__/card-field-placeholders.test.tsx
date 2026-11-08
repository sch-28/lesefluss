import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { NotStartedField, RatingField, TextField } from "../card-fields";

let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

describe("card field placeholders", () => {
	it("an unrated book shows faint empty stars labelled Not rated", async () => {
		rendered = await render(<RatingField rating={null} />);
		const label = rendered.container.querySelector("[aria-label='Not rated']");
		expect(label).not.toBeNull();
		expect(label?.querySelectorAll("svg.fill-primary")).toHaveLength(0);
	});

	it("an empty text field shows a dash, a filled one its text", async () => {
		rendered = await render(<TextField text="" />);
		expect(rendered.text()).toBe("–");
		await rendered.rerender(<TextField text="Jay Kristoff" />);
		expect(rendered.text()).toBe("Jay Kristoff");
	});

	it("an unstarted book says so in the progress slot", async () => {
		rendered = await render(<NotStartedField />);
		expect(rendered.text()).toBe("Not started");
	});
});
