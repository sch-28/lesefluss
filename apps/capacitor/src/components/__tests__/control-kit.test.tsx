import { FilterChip } from "@lesefluss/ui/filter-chip";
import { IconButton } from "@lesefluss/ui/icon-button";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { SheetDoneButton, SheetHeaderBar } from "@lesefluss/ui/sheet-header";
import { Stepper } from "@lesefluss/ui/stepper";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

async function press(el: Element) {
	await act(async () => {
		(el as HTMLElement).click();
	});
}

async function key(el: Element, k: string) {
	await act(async () => {
		el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	});
}

const OPTIONS = [
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
	{ value: "all", label: "All time" },
] as const;

describe("SegmentedControl", () => {
	it("is one named group whose selected item is marked on", async () => {
		view = await render(
			<SegmentedControl
				aria-label="Totals for"
				value="30d"
				onValueChange={vi.fn()}
				options={OPTIONS}
			/>,
		);
		const group = view.container.querySelector('[data-slot="segmented-control"]');
		expect(group?.getAttribute("aria-label")).toBe("Totals for");
		const on = [...view.container.querySelectorAll('[data-state="on"]')].map((b) => b.textContent);
		expect(on).toEqual(["30 days"]);
	});

	it("reports a tap on another item and keeps the selected one on a second tap", async () => {
		const onChange = vi.fn();
		view = await render(
			<SegmentedControl
				aria-label="Totals for"
				value="7d"
				onValueChange={onChange}
				options={OPTIONS}
			/>,
		);
		await press(view.getButton("All time"));
		expect(onChange).toHaveBeenLastCalledWith("all");
		onChange.mockClear();
		await press(view.getButton("7 days"));
		expect(onChange).not.toHaveBeenCalled();
	});

	it("moves focus between items with the arrow keys", async () => {
		view = await render(
			<SegmentedControl
				aria-label="Totals for"
				value="7d"
				onValueChange={vi.fn()}
				options={OPTIONS}
			/>,
		);
		const first = view.getButton("7 days");
		first.focus();
		await key(first, "ArrowRight");
		expect(document.activeElement?.textContent).toBe("30 days");
	});

	it("makes a 44px row: 38px items in a 3px track", async () => {
		view = await render(
			<SegmentedControl
				aria-label="Totals for"
				value="7d"
				onValueChange={vi.fn()}
				options={OPTIONS}
			/>,
		);
		const group = view.container.querySelector('[data-slot="segmented-control"]');
		expect(group?.className).toContain("p-[3px]");
		expect(view.getButton("7 days").className).toContain("min-h-[38px]");
	});
});

describe("FilterChip", () => {
	it("is a 44px toggle button that reports its state", async () => {
		const onClick = vi.fn();
		view = await render(
			<FilterChip selected={false} onClick={onClick}>
				Reading
			</FilterChip>,
		);
		const chip = view.getButton("Reading");
		expect(chip.getAttribute("aria-pressed")).toBe("false");
		expect(chip.className).toContain("h-11");
		await press(chip);
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("shows a count, but never a 0 count", async () => {
		view = await render(
			<>
				<FilterChip selected count={12}>
					Sci-fi
				</FilterChip>
				<FilterChip selected={false} count={0}>
					Empty
				</FilterChip>
			</>,
		);
		const [full, empty] = view.container.querySelectorAll("button");
		expect(full?.textContent).toBe("Sci-fi12");
		expect(empty?.textContent).toBe("Empty");
	});
});

describe("Stepper", () => {
	it("is a named group with 44px − and + buttons around its value", async () => {
		view = await render(
			<Stepper label="Font size" value="18 px" onDecrement={vi.fn()} onIncrement={vi.fn()} />,
		);
		const group = view.container.querySelector("fieldset");
		expect(group?.getAttribute("aria-label")).toBe("Font size");
		expect(view.getButton("Decrease font size").className).toContain("size-11");
		expect(view.getButton("Increase font size").className).toContain("size-11");
		expect(view.text()).toBe("−18 px+");
	});

	it("steps both ways and stays focusable but inert at a limit", async () => {
		const dec = vi.fn();
		const inc = vi.fn();
		view = await render(
			<Stepper
				label="Speed"
				value={300}
				canIncrement={false}
				onDecrement={dec}
				onIncrement={inc}
			/>,
		);
		await press(view.getButton("Decrease speed"));
		const plus = view.getButton("Increase speed");
		await press(plus);
		expect(dec).toHaveBeenCalledOnce();
		expect(inc).not.toHaveBeenCalled();
		expect(plus.getAttribute("aria-disabled")).toBe("true");
		expect(plus.disabled).toBe(false);
	});
});

describe("IconButton", () => {
	it("is a 44px button named by its label", async () => {
		const onClick = vi.fn();
		view = await render(
			<IconButton aria-label="Back" onClick={onClick}>
				<svg />
			</IconButton>,
		);
		const button = view.getButton("Back");
		expect(button.type).toBe("button");
		expect(button.className).toContain("size-11");
		await press(button);
		expect(onClick).toHaveBeenCalledOnce();
	});
});

describe("SheetHeaderBar", () => {
	it("puts the title left and a 44px Done right", async () => {
		const onDone = vi.fn();
		view = await render(
			<SheetHeaderBar
				title={<h3>View</h3>}
				subtitle={<p>12 books</p>}
				action={<SheetDoneButton onClick={onDone} />}
			/>,
		);
		const done = view.getButton("Done");
		expect(done.className).toContain("h-11");
		expect(view.text()).toBe("View12 booksDone");
		await press(done);
		expect(onDone).toHaveBeenCalledOnce();
	});
});
