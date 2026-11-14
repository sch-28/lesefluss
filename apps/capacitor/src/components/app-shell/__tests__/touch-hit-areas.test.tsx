import { Input, InputHitArea } from "@lesefluss/ui/input";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { ToggleRow } from "../toggle-row";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function click(el: Element) {
	act(() => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
	});
}

describe("ToggleRow", () => {
	it("flips the switch on a tap on the row's padding", async () => {
		const onCheckedChange = vi.fn();
		view = await render(
			<ToggleRow title="Haptics" checked={false} onCheckedChange={onCheckedChange} />,
		);
		const row = view.container.firstElementChild as HTMLElement;
		click(row);
		expect(onCheckedChange).toHaveBeenCalledTimes(1);
		expect(onCheckedChange).toHaveBeenCalledWith(true);
	});

	it("flips the switch once on a tap on the switch itself", async () => {
		const onCheckedChange = vi.fn();
		view = await render(
			<ToggleRow title="Haptics" checked={false} onCheckedChange={onCheckedChange} />,
		);
		click(view.getButton("Haptics"));
		expect(onCheckedChange).toHaveBeenCalledTimes(1);
	});
});

describe("InputHitArea", () => {
	it("focuses its input on a tap beside it", async () => {
		view = await render(
			<InputHitArea>
				<Input aria-label="Search" />
			</InputHitArea>,
		);
		const area = view.container.querySelector('[data-slot="input-hit-area"]');
		click(area as HTMLElement);
		expect(document.activeElement).toBe(view.container.querySelector("input"));
	});

	it("leaves a tap on a sibling control alone", async () => {
		view = await render(
			<InputHitArea>
				<Input aria-label="Search" />
				<button type="button">Clear</button>
			</InputHitArea>,
		);
		click(view.getButton("Clear"));
		expect(document.activeElement).not.toBe(view.container.querySelector("input"));
	});
});
