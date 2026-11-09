import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Rendered } from "../../../test/render";

let pickerKind: "folder" | "files" = "folder";

vi.mock("../../../services/book-import", () => ({ batchPickerKind: () => pickerKind }));
vi.mock("@lesefluss/ui/drawer", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return { Drawer: Pass, DrawerContent: Pass, DrawerHeader: Pass, DrawerTitle: Pass };
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

// The menu reads the picker kind once, when the module loads.
async function renderMenu(kind: "folder" | "files") {
	pickerKind = kind;
	vi.resetModules();
	const { render } = await import("../../../test/render");
	const { default: ImportSheet } = await import("../import-sheet");
	const noop = () => {};
	view = await render(
		<ImportSheet
			isOpen
			onClose={noop}
			onPickFile={noop}
			onPickFolder={noop}
			onPickClipboard={noop}
			onPickUrl={noop}
		/>,
	);
	return view.text();
}

describe("ImportSheet batch entry", () => {
	it("offers a folder where the picker opens one", async () => {
		const text = await renderMenu("folder");
		expect(text).toContain("Import folder");
		expect(text).toContain("Scan for books and pick what to keep");
		expect(text).not.toContain("Import multiple files");
	});

	it("offers several files where the picker selects files", async () => {
		const text = await renderMenu("files");
		expect(text).toContain("Import multiple files");
		expect(text).toContain("Select several books and pick what to keep");
		expect(text).not.toContain("folder");
	});
});
