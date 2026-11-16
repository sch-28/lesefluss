import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

let isDesktop = false;
vi.mock("../../hooks/use-media-query", () => ({ useDesktopOverlay: () => isDesktop }));
vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../test/overlay-mocks")).drawerModule,
);
vi.mock("@lesefluss/ui/dialog", async () => {
	const { MockOverlay } = await import("../../test/overlay-mocks");
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return {
		Dialog: (p: { open: boolean; children?: React.ReactNode }) => (
			<MockOverlay testId="dialog" {...p} />
		),
		DialogContent: Pass,
		DialogHeader: Pass,
		DialogTitle: Pass,
	};
});

const { SheetOrDialog } = await import("../sheet-or-dialog");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	isDesktop = false;
});

const shown = (testId: string) => view?.container.querySelector(`[data-testid=${testId}]`);

describe("SheetOrDialog", () => {
	it("is a bottom sheet on touch and a dialog with a mouse on a wide screen", async () => {
		view = await render(
			<SheetOrDialog open onOpenChange={() => {}} title="Reading goal">
				<p>body</p>
			</SheetOrDialog>,
		);
		expect(shown("sheet")?.textContent).toContain("Reading goal");
		expect(shown("dialog")).toBeNull();
		view.unmount();

		isDesktop = true;
		view = await render(
			<SheetOrDialog open onOpenChange={() => {}} title="Reading goal" aside="3 books">
				<p>body</p>
			</SheetOrDialog>,
		);
		expect(shown("dialog")?.textContent).toContain("Reading goal3 booksbody");
		expect(shown("sheet")).toBeNull();
	});
});
