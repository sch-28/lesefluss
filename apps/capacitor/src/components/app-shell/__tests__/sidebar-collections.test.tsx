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
	it("shows the open collection's options without a hover, the others on hover", async () => {
		location = { pathname: "/tabs/library", search: { collection: "b" } };
		rendered = await render(<SidebarCollections isCollapsed={false} onExpand={vi.fn()} />);
		expect(optionsButton("C b")?.className).toContain("inline-flex");
		expect(optionsButton("C b")?.className).not.toMatch(/(^| )hidden( |$)/);
		expect(optionsButton("C a")?.className).toMatch(/(^| )hidden( |$)/);
		expect(optionsButton("C a")?.className).toContain("group-hover:inline-flex");
	});
});
