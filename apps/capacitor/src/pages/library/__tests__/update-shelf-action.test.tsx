import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { UpdateShelfAction } from "../update-shelf-action";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("UpdateShelfAction", () => {
	it("says why a shelf without a filter can't be updated, instead of a greyed button", async () => {
		view = await render(
			<UpdateShelfAction canSave={false} isPending={false} onUpdate={() => {}} />,
		);
		expect(view.container.querySelector("button")).toBeNull();
		expect(view.container.textContent).toBe("Add a filter to update this shelf");
	});

	it("updates the shelf when it has a filter", async () => {
		const onUpdate = vi.fn();
		view = await render(<UpdateShelfAction canSave isPending={false} onUpdate={onUpdate} />);
		await click(view.container.querySelector("button") as HTMLElement);
		expect(onUpdate).toHaveBeenCalledOnce();
	});
});
