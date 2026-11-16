import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../test/render";
import { ActionSheet, type ActionSheetItem } from "../action-sheet";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.body.innerHTML = "";
	vi.useRealTimers();
});

function items(count: number, onSelect = () => {}): ActionSheetItem[] {
	return Array.from({ length: count }, (_, i) => ({ label: `Action ${i + 1}`, onSelect }));
}

function press(x = 120, y = 300) {
	window.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
}

function pointer(kind: "fine" | "coarse") {
	return vi.spyOn(window, "matchMedia").mockImplementation(
		(query) =>
			({
				matches: query === `(pointer: ${kind})`,
				addEventListener() {},
				removeEventListener() {},
			}) as unknown as MediaQueryList,
	);
}

const menu = () => document.querySelector('[data-testid="action-menu"]');
const drawer = () => document.querySelector('[data-slot="drawer-content"]');

describe("ActionSheet placement", () => {
	it("opens a short list as an anchored menu without a dim at the press", async () => {
		press();
		view = await render(<ActionSheet open onOpenChange={() => {}} title="Book" items={items(5)} />);
		await flush();
		expect(menu()).not.toBeNull();
		expect(drawer()).toBeNull();
		expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
		expect(menu()?.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
	});

	it("keeps a long list in a bottom sheet on touch", async () => {
		pointer("coarse");
		press();
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(7)} />);
		await flush();
		expect(menu()).toBeNull();
		expect(drawer()).not.toBeNull();
	});

	it("falls back to the sheet on touch when no recent press opened it", async () => {
		pointer("coarse");
		vi.useFakeTimers({ toFake: ["Date"] });
		press();
		vi.setSystemTime(Date.now() + 5000);
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(3)} />);
		await flush();
		expect(menu()).toBeNull();
		expect(drawer()).not.toBeNull();
	});

	it("opens a long list as a menu at the press with a mouse", async () => {
		pointer("fine");
		press();
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(9)} />);
		await flush();
		expect(drawer()).toBeNull();
		expect(menu()?.querySelectorAll('[role="menuitem"]')).toHaveLength(9);
	});

	it("anchors a keyboard open at the focused trigger with a mouse", async () => {
		pointer("fine");
		vi.useFakeTimers({ toFake: ["Date"] });
		press();
		vi.setSystemTime(Date.now() + 5000);
		const trigger = document.createElement("button");
		document.body.append(trigger);
		vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 40, y: 100, width: 32, height: 32 }),
		);
		trigger.focus();
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(3)} />);
		await flush();
		expect(drawer()).toBeNull();
		expect(menu()).not.toBeNull();
	});

	it("shows an item's hint under its label", async () => {
		pointer("fine");
		press();
		view = await render(
			<ActionSheet
				open
				onOpenChange={() => {}}
				items={[{ label: "Import file", hint: "TXT, EPUB", onSelect: () => {} }]}
			/>,
		);
		await flush();
		expect(menu()?.querySelector('[role="menuitem"]')?.textContent).toBe("Import fileTXT, EPUB");
	});

	it("runs the chosen action once and closes", async () => {
		const onSelect = vi.fn();
		const onOpenChange = vi.fn();
		press();
		view = await render(
			<ActionSheet open onOpenChange={onOpenChange} items={items(2, onSelect)} />,
		);
		await flush();
		const item = menu()?.querySelector('[role="menuitem"]') as HTMLElement;
		await act(async () => {
			item.click();
		});
		await flush();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

describe("ActionSheet danger group", () => {
	const mixed: ActionSheetItem[] = [
		{ label: "Edit", onSelect: () => {} },
		{ label: "Report", onSelect: () => {} },
		{ label: "Remove", onSelect: () => {}, destructive: true },
		{ label: "Block", onSelect: () => {}, destructive: true },
	];

	it("sets the destructive items apart with one rule in the menu", async () => {
		press();
		view = await render(<ActionSheet open onOpenChange={() => {}} items={mixed} />);
		await flush();
		const rules = menu()?.querySelectorAll('[role="separator"]') ?? [];
		expect(rules).toHaveLength(1);
		expect(rules[0]?.nextElementSibling?.textContent).toBe("Remove");
	});

	it("does the same in the sheet, and draws no rule when every item is destructive", async () => {
		pointer("coarse");
		const long = [...items(5), ...mixed.slice(2)];
		view = await render(<ActionSheet open onOpenChange={() => {}} items={long} />);
		await flush();
		expect(drawer()?.querySelectorAll("hr")).toHaveLength(1);
		view.unmount();
		document.body.innerHTML = "";
		view = await render(<ActionSheet open onOpenChange={() => {}} items={mixed.slice(2)} />);
		await flush();
		expect(document.querySelectorAll('[role="separator"], hr')).toHaveLength(0);
	});
});
