import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../test/render";
import { GoalRing } from "../goal-ring";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const check = (rendered: Rendered) =>
	rendered.container.querySelector('[data-testid="goal-ring-check"]');

describe("GoalRing", () => {
	it("shows a check inside a met ring with no label", async () => {
		view = await render(<GoalRing size={56} fraction={1} isMet />);
		expect(check(view)).not.toBeNull();
	});

	it("shows the check when the caller's label is a false conditional", async () => {
		view = await render(
			<GoalRing size={56} fraction={1} isMet>
				{false}
			</GoalRing>,
		);
		expect(check(view)).not.toBeNull();
	});

	it("keeps the caller's label over the check, and no check while unmet", async () => {
		view = await render(
			<GoalRing size={36} fraction={1} isMet>
				12
			</GoalRing>,
		);
		expect(check(view)).toBeNull();
		expect(view.container.textContent).toBe("12");
		view.unmount();
		view = await render(<GoalRing size={56} fraction={0.4} />);
		expect(check(view)).toBeNull();
	});
});
