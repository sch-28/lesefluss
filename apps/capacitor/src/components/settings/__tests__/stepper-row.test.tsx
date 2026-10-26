import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { StepperRow } from "../stepper-row";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const press = (label: string) =>
	act(() => {
		(view?.container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click();
	});

describe("StepperRow", () => {
	it("steps on the grid that starts at its minimum", async () => {
		const onChange = vi.fn();
		view = await render(
			<StepperRow
				label="Gap"
				value={1.1}
				display="1.1"
				min={0.5}
				max={2.9}
				step={0.3}
				onChange={onChange}
			/>,
		);

		press("Increase Gap");

		expect(onChange).toHaveBeenCalledWith(1.4);
	});

	it("keeps its focusable button at the end of the range and does nothing there", async () => {
		const onChange = vi.fn();
		view = await render(
			<StepperRow
				label="Gap"
				value={2.9}
				display="2.9"
				min={0.5}
				max={2.9}
				step={0.3}
				onChange={onChange}
			/>,
		);
		const increase = view.container.querySelector(
			'[aria-label="Increase Gap"]',
		) as HTMLButtonElement;

		press("Increase Gap");

		expect(increase.disabled).toBe(false);
		expect(increase.getAttribute("aria-disabled")).toBe("true");
		expect(onChange).not.toHaveBeenCalled();
	});
});
