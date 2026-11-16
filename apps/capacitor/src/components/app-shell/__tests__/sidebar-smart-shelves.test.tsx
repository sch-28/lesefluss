import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShelfEntry } from "../../../pages/library/smart-shelves";
import { click, type Rendered, render } from "../../../test/render";

const setBuiltInPinned = vi.fn();
const navigate = vi.fn();
const shelves: Partial<ShelfEntry>[] = [
	{ id: "reading", name: "Reading", isBuiltIn: true, pinned: true },
	{ id: "unread", name: "Unread", isBuiltIn: true, pinned: false },
	{ id: "u1", name: "Mine", isBuiltIn: false, pinned: false },
];

vi.mock("@tanstack/react-router", () => ({
	useLocation: () => ({ pathname: "/tabs/library", search: { f: "enc-filter" } }),
	useNavigate: () => navigate,
	Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("../../../pages/library/use-smart-shelves", () => ({
	useSmartShelves: () => ({
		shelves,
		counts: new Map([
			["reading", 3],
			["unread", 0],
		]),
		setBuiltInPinned,
	}),
}));
vi.mock("../../smart-shelves/shelf-actions", () => ({ ShelfActions: () => null }));

const { SidebarSmartShelves } = await import("../sidebar-smart-shelves");

let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
	setBuiltInPinned.mockClear();
	navigate.mockClear();
});

const button = (label: string) =>
	rendered?.container.querySelector<HTMLElement>(`button[aria-label="${label}"]`) ?? null;
const pressable = (label: string) => {
	const el = button(label);
	if (!el) throw new Error(`no button "${label}"`);
	return el;
};

describe("SidebarSmartShelves", () => {
	it("unpins a built-in shelf with one direct button, no one-item menu", async () => {
		rendered = await render(<SidebarSmartShelves isCollapsed={false} onExpand={vi.fn()} />);
		expect(button("Reading options")).toBeNull();
		await click(pressable("Unpin Reading"));
		expect(setBuiltInPinned).toHaveBeenCalledWith("reading", false);
		await click(pressable("Pin Unread"));
		expect(setBuiltInPinned).toHaveBeenCalledWith("unread", true);
	});

	it("keeps a user shelf's options visible without a hover", async () => {
		rendered = await render(<SidebarSmartShelves isCollapsed={false} onExpand={vi.fn()} />);
		for (const label of ["Mine options", "Unpin Reading", "Pin Unread"]) {
			expect(button(label)?.className).toContain("inline-flex");
			expect(button(label)?.className).not.toMatch(/(^| )hidden( |$)|group-hover/);
		}
	});

	it("shows every count, zero too, and no pinned dot or second create row", async () => {
		rendered = await render(<SidebarSmartShelves isCollapsed={false} onExpand={vi.fn()} />);
		const counts = [...(rendered?.container.querySelectorAll("a span.tabular-nums") ?? [])];
		expect(counts.map((c) => c.textContent)).toEqual(["3", "0", "0"]);
		expect(rendered?.container.querySelector('[aria-label="Pinned"]')).toBeNull();
		expect(rendered?.container.textContent).not.toContain("Save current filter");
		expect(button("New smart shelf")).not.toBeNull();
	});

	it("opens the New smart shelf page from the library's current filter", async () => {
		rendered = await render(<SidebarSmartShelves isCollapsed={false} onExpand={vi.fn()} />);
		await click(pressable("New smart shelf"));
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/library/shelves/new",
			search: { f: "enc-filter" },
		});
	});
});
