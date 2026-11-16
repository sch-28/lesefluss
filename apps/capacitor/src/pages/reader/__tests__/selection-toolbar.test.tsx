import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import SelectionToolbar from "../selection-toolbar";

const toastInfo = vi.hoisted(() => vi.fn());
vi.mock("../../../components/toast", () => ({ toast: { info: toastInfo } }));

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	toastInfo.mockClear();
});

const noop = () => {};
const mount = (isSingleWord: boolean, onLookup = noop) =>
	render(
		<SelectionToolbar
			step="actions"
			selectedColor={null}
			isSingleWord={isSingleWord}
			onHighlight={noop}
			onColorChange={noop}
			onNote={noop}
			onLookup={onLookup}
			onAddToGlossary={noop}
			onDelete={noop}
		/>,
	);

const lookUp = (v: Rendered) =>
	[...v.container.querySelectorAll("button")].find(
		(b) => b.textContent === "Look up",
	) as HTMLElement;

describe("SelectionToolbar Look up", () => {
	it("says on tap why it can't look up a phrase, since touch shows no tooltip", async () => {
		const onLookup = vi.fn();
		view = await mount(false, onLookup);
		expect(lookUp(view).getAttribute("aria-disabled")).toBe("true");
		await click(lookUp(view));
		expect(onLookup).not.toHaveBeenCalled();
		expect(toastInfo).toHaveBeenCalledWith("Look up works on one word");
	});

	it("looks up a single word", async () => {
		const onLookup = vi.fn();
		view = await mount(true, onLookup);
		await click(lookUp(view));
		expect(onLookup).toHaveBeenCalledOnce();
		expect(toastInfo).not.toHaveBeenCalled();
	});
});
