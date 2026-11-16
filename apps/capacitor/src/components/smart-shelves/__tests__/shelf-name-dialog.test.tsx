import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import type React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

let isDesktop = false;
vi.mock("../../../hooks/use-media-query", () => ({ useMediaQuery: () => isDesktop }));
vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../../test/overlay-mocks")).drawerModule,
);
vi.mock("../../modal", async () => {
	const { MockOverlay } = await import("../../../test/overlay-mocks");
	return {
		Modal: (p: {
			open: boolean;
			onOpenChange: (open: boolean) => void;
			contentClassName?: string;
			children?: React.ReactNode;
		}) => (
			<MockOverlay
				testId="dialog"
				className={p.contentClassName}
				open={p.open}
				onOpenChange={p.onOpenChange}
			>
				{p.children}
			</MockOverlay>
		),
	};
});

const { ShelfNameDialog } = await import("../shelf-name-dialog");

const onSubmit = vi.fn();
const onOpenChange = vi.fn();
let view: Rendered | undefined;

beforeEach(() => {
	vi.clearAllMocks();
	isDesktop = false;
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const renderDialog = async (open = true) => {
	view = await render(
		<ShelfNameDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Rename shelf"
			confirmLabel="Rename"
			onSubmit={onSubmit}
		/>,
	);
	return view;
};

function typeName(value: string) {
	const input = view?.container.querySelector("input") as HTMLInputElement;
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	return input;
}

describe("ShelfNameDialog", () => {
	it("submits on the keyboard's action key, which submits the form without an Enter keydown", async () => {
		await renderDialog();
		const input = typeName("  Long reads  ");
		expect(input.getAttribute("enterkeyhint")).toBe("done");
		const form = input.closest("form");
		expect(form).not.toBeNull();
		act(() => {
			form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		expect(onSubmit).toHaveBeenCalledWith("Long reads");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("submits on the Rename button and ignores a blank name", async () => {
		await renderDialog();
		typeName("   ");
		expect(view?.getButton("Rename").disabled).toBe(true);
		typeName("Short");
		await click(view?.getButton("Rename") as HTMLButtonElement);
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith("Short");
	});

	it("opens as a bottom sheet on phone and a narrow dialog on desktop", async () => {
		await renderDialog();
		expect(view?.container.querySelector("[data-testid=sheet]")).not.toBeNull();
		expect(view?.container.querySelector("[data-testid=dialog]")).toBeNull();
		view?.unmount();

		isDesktop = true;
		await renderDialog();
		const dialog = view?.container.querySelector("[data-testid=dialog]");
		expect(dialog?.className).toContain("sm:max-w-sm");
		expect(view?.container.querySelector("[data-testid=sheet]")).toBeNull();
	});

	it("takes the Android back press while open, so the page beneath does not navigate", async () => {
		await renderDialog();
		expect(consumeBackPress()).toBe(true);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("leaves the back press to the router while closed", async () => {
		await renderDialog(false);
		expect(consumeBackPress()).toBe(false);
	});
});
