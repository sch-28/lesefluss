import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

let isWide = false;
let isFine = false;
let isNative = false;
vi.mock("../../hooks/use-media-query", () => ({
	FINE_POINTER_QUERY: "(pointer: fine)",
	useDesktopOverlay: () => isWide,
	useMediaQuery: () => isFine,
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNative } }));
vi.mock("@lesefluss/ui/drawer", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return {
		Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
			open ? <div data-testid="sheet">{children}</div> : null,
		DrawerContent: (p: { children?: React.ReactNode; onOpenAutoFocus?: (e: Event) => void }) => {
			sheetAutoFocus = p.onOpenAutoFocus;
			return <div>{p.children}</div>;
		},
		DrawerDescription: Pass,
		DrawerHeader: Pass,
		DrawerTitle: Pass,
	};
});
let modalAutoFocus: ((e: Event) => void) | undefined;
let sheetAutoFocus: ((e: Event) => void) | undefined;
vi.mock("../modal", () => ({
	Modal: (p: {
		open: boolean;
		children?: React.ReactNode;
		onOpenAutoFocus?: (e: Event) => void;
	}) => {
		modalAutoFocus = p.onOpenAutoFocus;
		return p.open ? <div data-testid="dialog">{p.children}</div> : null;
	},
}));

const { EntryDialog } = await import("../entry-dialog");

let view: Rendered | undefined;
beforeEach(() => {
	isWide = false;
	isFine = false;
	isNative = false;
	modalAutoFocus = undefined;
	sheetAutoFocus = undefined;
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

async function shape(focusesField?: boolean) {
	view = await render(
		<EntryDialog
			open
			onOpenChange={() => {}}
			title="Save as smart shelf"
			focusesField={focusesField}
		>
			<input aria-label="Shelf name" />
		</EntryDialog>,
	);
	const sheet = view.container.querySelector("[data-testid=sheet]");
	const dialog = view.container.querySelector("[data-testid=dialog]");
	view.unmount();
	view = undefined;
	return sheet ? "sheet" : dialog ? "dialog" : "none";
}

describe("EntryDialog", () => {
	it("picks the same shape in the native app as on the web", async () => {
		isNative = true;
		expect(await shape()).toBe("sheet");
		isWide = true;
		expect(await shape()).toBe("dialog");
	});

	it("opens the dialog with a mouse with its text field focused, not the button above it", async () => {
		isWide = true;
		isFine = true;
		await shape();
		expect(focusedOnOpen(modalAutoFocus)).toBe("Shelf name");
	});

	it("opens a facts dialog focused on itself, not its first field", async () => {
		isWide = true;
		isFine = true;
		await shape(false);
		expect(focusedOnOpen(modalAutoFocus)).toBe("dialog");
	});

	it("focuses the field in the sheet on a narrow window with a mouse", async () => {
		isFine = true;
		await shape();
		expect(focusedOnOpen(sheetAutoFocus)).toBe("Shelf name");
	});

	it("leaves the field unfocused in the sheet on touch, so the keyboard stays closed", async () => {
		await shape();
		expect(sheetAutoFocus).toBeUndefined();
	});

	it("is a centred dialog on a wide screen with a mouse, else a sheet", async () => {
		isWide = true;
		expect(await shape()).toBe("dialog");
		isWide = false;
		expect(await shape()).toBe("sheet");
	});
});

/** Runs the open-autofocus handler on a stand-in dialog and names what took focus. */
function focusedOnOpen(handler: ((e: Event) => void) | undefined): string | null {
	const dialog = document.createElement("div");
	dialog.tabIndex = -1;
	dialog.setAttribute("aria-label", "dialog");
	dialog.innerHTML = '<button type="button">Pick colour</button><input aria-label="Shelf name" />';
	document.body.append(dialog);
	const open = new Event("focusScope.autoFocusOnMount", { cancelable: true });
	dialog.addEventListener(open.type, (e) => handler?.(e));
	dialog.dispatchEvent(open);
	const name = open.defaultPrevented
		? (document.activeElement?.getAttribute("aria-label") ?? null)
		: null;
	dialog.remove();
	return name;
}
