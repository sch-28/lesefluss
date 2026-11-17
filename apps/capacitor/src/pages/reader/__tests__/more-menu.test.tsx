import { Search } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";

let isFinePointer = false;
vi.mock("../../../hooks/use-media-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../hooks/use-media-query")>()),
	useMediaQuery: () => isFinePointer,
}));
vi.mock("../../../components/command-palette", () => ({
	MenuKey: ({ commandId }: { commandId: string }) => <kbd>{commandId}</kbd>,
}));

const { ReaderMoreMenu } = await import("../more-menu");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.body.innerHTML = "";
	isFinePointer = false;
});

const items = (onSearch = () => {}) => [
	{ label: "Search in book", icon: Search, commandId: "reader.search", onSelect: onSearch },
	{ label: "Book details", onSelect: () => {} },
];

const sheet = () => document.querySelector('[data-slot="drawer-content"]');

describe("ReaderMoreMenu", () => {
	it("opens a bottom sheet on touch, however short the list", async () => {
		const onSearch = vi.fn();
		view = await render(<ReaderMoreMenu title="Middlemarch" items={items(onSearch)} />);
		await click(view.getButton("More actions"));
		await flush();
		expect(document.querySelector('[role="menu"]')).toBeNull();
		expect(sheet()?.textContent).toContain("Middlemarch");
		const search = [...(sheet()?.querySelectorAll("button") ?? [])].find(
			(b) => b.textContent === "Search in book",
		) as HTMLButtonElement;
		await click(search);
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it("keeps the anchored dropdown with its shortcut chips for a mouse", async () => {
		isFinePointer = true;
		view = await render(<ReaderMoreMenu title="Middlemarch" items={items()} />);
		const trigger = view.getButton("More actions");
		trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
		await flush();
		expect(sheet()).toBeNull();
		expect(document.querySelector('[role="menu"]')?.textContent).toContain(
			"Search in bookreader.search",
		);
	});
});
