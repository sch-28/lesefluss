import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { GoalDivider } from "../goal-divider";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const divider = (v: Rendered) => v.container.querySelector('[data-testid="goal-divider"]');
const status = (v: Rendered) => v.container.querySelector('[role="status"]')?.textContent;
const at = (passed: boolean, label = "4%") => (
	<p>
		<GoalDivider label={label} passed={passed} />
	</p>
);

describe("GoalDivider", () => {
	it("celebrates and announces a pass it sees happen, once", async () => {
		view = await render(at(false));
		expect(divider(view)?.getAttribute("data-celebrate")).toBe("false");
		expect(status(view)).toBe("");
		await view.rerender(at(true));
		expect(divider(view)?.getAttribute("data-celebrate")).toBe("true");
		expect(status(view)).toBe("Today's target met");
		// A later render, such as a relabel, keeps the class rather than starting it over.
		await view.rerender(at(true, "5%"));
		expect(divider(view)?.getAttribute("data-celebrate")).toBe("true");
	});

	it("shows an earlier pass without celebrating or announcing it when it mounts again", async () => {
		view = await render(at(true));
		expect(divider(view)?.getAttribute("data-passed")).toBe("true");
		expect(divider(view)?.getAttribute("data-celebrate")).toBe("false");
		expect(status(view)).toBe("");
	});
});
