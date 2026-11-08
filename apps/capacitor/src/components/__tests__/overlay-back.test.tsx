import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@lesefluss/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@lesefluss/ui/sheet";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";
import { ActionSheet } from "../action-sheet";
import { ConfirmDialog } from "../confirm-dialog";
import { Modal } from "../modal";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.body.innerHTML = "";
});

function back(): boolean {
	let consumed = false;
	act(() => {
		consumed = consumeBackPress();
	});
	return consumed;
}

function MenuWithConfirm() {
	const [menu, setMenu] = useState(true);
	const [confirm, setConfirm] = useState(true);
	return (
		<>
			<ActionSheet open={menu} onOpenChange={setMenu} title="Menu" items={[]} />
			<ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete it?" />
		</>
	);
}

const bodyText = () => document.body.textContent ?? "";

describe("Android back on the shared overlays", () => {
	it("closes the newest overlay first, then the one beneath, then leaves back to the router", async () => {
		view = await render(<MenuWithConfirm />);
		expect(bodyText()).toContain("Delete it?");

		expect(back()).toBe(true);
		expect(bodyText()).not.toContain("Delete it?");
		expect(bodyText()).toContain("Menu");

		expect(back()).toBe(true);
		expect(back()).toBe(false);
	});

	it("swallows the press without closing while a modal is not dismissable", async () => {
		const onOpenChange = vi.fn();
		view = await render(
			<Modal open onOpenChange={onOpenChange} title="Importing" dismissable={false}>
				busy
			</Modal>,
		);
		expect(back()).toBe(true);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("registers nothing while every overlay is closed", async () => {
		view = await render(<ConfirmDialog open={false} onOpenChange={vi.fn()} title="Delete it?" />);
		expect(back()).toBe(false);
	});

	it("closes an open popover, menu or select and nothing more (LESE-185.11)", async () => {
		const onPopover = vi.fn();
		const onMenu = vi.fn();
		const onSelect = vi.fn();
		view = await render(
			<>
				<Popover open onOpenChange={onPopover}>
					<PopoverTrigger>Sort</PopoverTrigger>
					<PopoverContent>Sort by title</PopoverContent>
				</Popover>
				<DropdownMenu open onOpenChange={onMenu}>
					<DropdownMenuTrigger>Range</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem>Week</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Select open onOpenChange={onSelect} value="a">
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="a">A</SelectItem>
					</SelectContent>
				</Select>
			</>,
		);
		expect(back()).toBe(true);
		expect(onSelect).toHaveBeenCalledWith(false);
		expect(onMenu).not.toHaveBeenCalled();
	});

	it("closes an open dropdown menu on back", async () => {
		view = await render(
			<DropdownMenu defaultOpen>
				<DropdownMenuTrigger>Range</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>Week</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
		expect(bodyText()).toContain("Week");
		expect(back()).toBe(true);
		expect(bodyText()).not.toContain("Week");
		expect(back()).toBe(false);
	});

	it("closes an open sheet on back", async () => {
		const onOpenChange = vi.fn();
		view = await render(
			<Sheet open onOpenChange={onOpenChange}>
				<SheetContent>
					<SheetTitle>View</SheetTitle>
				</SheetContent>
			</Sheet>,
		);
		expect(back()).toBe(true);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("closes an uncontrolled popover on back", async () => {
		view = await render(
			<Popover defaultOpen>
				<PopoverTrigger>Info</PopoverTrigger>
				<PopoverContent>Speed details</PopoverContent>
			</Popover>,
		);
		expect(bodyText()).toContain("Speed details");
		expect(back()).toBe(true);
		expect(bodyText()).not.toContain("Speed details");
		expect(back()).toBe(false);
	});

	it("leaves back to the router while every popover and menu is closed", async () => {
		view = await render(
			<>
				<Popover>
					<PopoverTrigger>Sort</PopoverTrigger>
					<PopoverContent>Sort by title</PopoverContent>
				</Popover>
				<DropdownMenu>
					<DropdownMenuTrigger>Range</DropdownMenuTrigger>
				</DropdownMenu>
			</>,
		);
		expect(back()).toBe(false);
	});
});
