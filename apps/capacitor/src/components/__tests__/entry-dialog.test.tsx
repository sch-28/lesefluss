import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

let isWide = false;
let isNative = false;
vi.mock("../../hooks/use-media-query", () => ({ useMediaQuery: () => isWide }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNative } }));
vi.mock("@lesefluss/ui/drawer", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return {
		Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
			open ? <div data-testid="sheet">{children}</div> : null,
		DrawerContent: Pass,
		DrawerDescription: Pass,
		DrawerHeader: Pass,
		DrawerTitle: Pass,
	};
});
vi.mock("../modal", () => ({
	Modal: (p: { open: boolean; children?: React.ReactNode }) =>
		p.open ? <div data-testid="dialog">{p.children}</div> : null,
}));

const { EntryDialog } = await import("../entry-dialog");

let view: Rendered | undefined;
beforeEach(() => {
	isWide = false;
	isNative = false;
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

async function shape() {
	view = await render(
		<EntryDialog open onOpenChange={() => {}} title="Save as smart shelf">
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
	it("is a bottom sheet in the native app whatever the width", async () => {
		isNative = true;
		expect(await shape()).toBe("sheet");
		isWide = true;
		expect(await shape()).toBe("sheet");
	});

	it("is a centred dialog on wide web and a sheet on narrow web", async () => {
		isWide = true;
		expect(await shape()).toBe("dialog");
		isWide = false;
		expect(await shape()).toBe("sheet");
	});
});
