import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { type Rendered, render } from "../../../test/render";

let location: { pathname: string; search: Record<string, string> } = {
	pathname: "/tabs/library",
	search: {},
};

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useLocation: () => location,
	Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useCollections: () => ({ data: [collection("a"), collection("b")] }),
		useMoveCollection: () => ({ mutate: vi.fn() }),
		useAddBooksToCollection: () => ({ mutate: vi.fn() }),
	},
}));
vi.mock("../../collections/collection-actions", () => ({
	CollectionActions: () => null,
	indexBeside: () => 0,
}));
vi.mock("../../toast", () => ({ toast: { success: vi.fn() } }));

const { SidebarCollections } = await import("../sidebar-collections");

function collection(id: string): CollectionWithCount {
	return {
		id,
		name: `C ${id}`,
		sortOrder: 1,
		ordered: false,
		seriesKey: null,
		view: null,
		deleted: false,
		createdAt: 1,
		updatedAt: 1,
		bookCount: 2,
	};
}

let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

const optionsButton = (name: string) =>
	rendered?.container.querySelector<HTMLElement>(`button[aria-label="${name} options"]`);

describe("SidebarCollections", () => {
	it("shows every collection's options and count without a hover", async () => {
		location = { pathname: "/tabs/library", search: { collection: "b" } };
		rendered = await render(<SidebarCollections isCollapsed={false} onExpand={vi.fn()} />);
		for (const name of ["C a", "C b"]) {
			expect(optionsButton(name)?.className).toContain("inline-flex");
			expect(optionsButton(name)?.className).not.toMatch(/(^| )hidden( |$)|group-hover/);
		}
		const counts = rendered?.container.querySelectorAll("a span.tabular-nums");
		expect([...(counts ?? [])].map((c) => [c.textContent, c.className.includes("hidden")])).toEqual(
			[
				["2", false],
				["2", false],
			],
		);
	});

	it("offers one New collection entry, in the header", async () => {
		rendered = await render(<SidebarCollections isCollapsed={false} onExpand={vi.fn()} />);
		const buttons = [...(rendered?.container.querySelectorAll("button") ?? [])];
		const entries = buttons.filter(
			(b) =>
				b.getAttribute("aria-label") === "New collection" || b.textContent === "New collection",
		);
		expect(entries).toHaveLength(1);
	});
});
