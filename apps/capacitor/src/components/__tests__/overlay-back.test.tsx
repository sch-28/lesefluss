import { consumeBackPress } from "@lesefluss/ui/overlay-back";
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
});
