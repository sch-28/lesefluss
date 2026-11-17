import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../test/render";
import { ActionSheet, type ActionSheetItem, anchorPlacement } from "../action-sheet";

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
const anchorBox = () => {
	const style = document.querySelector<HTMLElement>("body > span.pointer-events-none.fixed")?.style;
	return style && { left: style.left, top: style.top, width: style.width, height: style.height };
};
const drawer = () => document.querySelector('[data-slot="drawer-content"]');

describe("ActionSheet placement", () => {
	it("opens a short list as an anchored menu without a dim at the press with a mouse", async () => {
		pointer("fine");
		press();
		view = await render(<ActionSheet open onOpenChange={() => {}} title="Book" items={items(5)} />);
		await flush();
		expect(menu()).not.toBeNull();
		expect(drawer()).toBeNull();
		expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
		expect(menu()?.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
	});

	it.each([2, 7])("opens %i items as a bottom sheet on touch, even at the press", async (count) => {
		pointer("coarse");
		press();
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(count)} />);
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

	it("hangs the menu from the pressed button's box, in a span on <body>", async () => {
		pointer("fine");
		const header = document.createElement("header");
		const trigger = document.createElement("button");
		header.append(trigger);
		document.body.append(header);
		vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 900, y: 10, width: 32, height: 32 }),
		);
		trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(3)} />);
		await flush();
		expect(anchorBox()).toEqual({ left: "900px", top: "10px", width: "32px", height: "32px" });
		expect(menu()).not.toBeNull();
	});

	it("anchors a click with no pointerdown before it (keyboard or script) at its button", async () => {
		pointer("fine");
		const trigger = document.createElement("button");
		document.body.append(trigger);
		vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 40, y: 100, width: 32, height: 32 }),
		);
		trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(3)} />);
		await flush();
		expect(drawer()).toBeNull();
		expect(anchorBox()?.left).toBe("40px");
	});

	it("falls back to the press point when the pressed control is a large area", async () => {
		pointer("fine");
		const card = document.createElement("button");
		document.body.append(card);
		vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
			DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 300 }),
		);
		card.dispatchEvent(
			new PointerEvent("pointerdown", { clientX: 150, clientY: 120, bubbles: true }),
		);
		view = await render(<ActionSheet open onOpenChange={() => {}} items={items(3)} />);
		await flush();
		expect(anchorBox()).toMatchObject({ left: "150px", top: "120px", width: "0px" });
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
		pointer("fine");
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
		pointer("fine");
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

describe("anchorPlacement", () => {
	it("opens a press point's menu from its start, a little away from the finger", () => {
		expect(anchorPlacement({ x: 900, y: 10, width: 0, height: 0 })).toEqual({
			align: "start",
			sideOffset: 12,
		});
	});

	it("aligns a trigger's menu to the trigger's edge nearer the middle of the window", () => {
		const left = window.innerWidth / 4;
		const right = (window.innerWidth * 3) / 4;
		expect(anchorPlacement({ x: left, y: 10, width: 32, height: 32 })).toEqual({
			align: "start",
			sideOffset: 4,
		});
		expect(anchorPlacement({ x: right, y: 10, width: 32, height: 32 })).toEqual({
			align: "end",
			sideOffset: 4,
		});
	});
});
