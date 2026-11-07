import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShelfEntry } from "../../../pages/library/smart-shelves";
import { click, type Rendered, render } from "../../../test/render";

const navigate = vi.fn();
let location = { pathname: "/tabs/library", search: {} as Record<string, string> };
const updateShelf = vi.fn();
const deleteShelf = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useLocation: () => location,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useUpdateSmartShelf: () => ({ mutate: updateShelf }),
		useDeleteSmartShelf: () => ({ mutate: deleteShelf }),
	},
}));
vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../../test/overlay-mocks")).drawerModule,
);
vi.mock("../../confirm-dialog", async () => {
	const { MockOverlay } = await import("../../../test/overlay-mocks");
	return {
		ConfirmDialog: (p: {
			open: boolean;
			onOpenChange: (open: boolean) => void;
			description?: string;
			onConfirm: () => void;
		}) => (
			<MockOverlay open={p.open} onOpenChange={p.onOpenChange}>
				{p.description}
				<button type="button" onClick={p.onConfirm}>
					Confirm delete
				</button>
			</MockOverlay>
		),
	};
});
vi.mock("../shelf-name-dialog", () => ({ ShelfNameDialog: () => null }));
vi.mock("../../../pages/library/shelf-condition-editor", () => ({
	ShelfConditionEditor: (p: { open: boolean; shelf: ShelfEntry | null }) =>
		p.open ? <div data-testid="editor">{p.shelf?.name}</div> : null,
}));

const { ShelfActions } = await import("../shelf-actions");
const { filterToTree } = await import("../../../pages/library/condition-tree");

const filter = { status: { in: ["reading"], out: [] } };
const builtIn: ShelfEntry = {
	id: "builtin:reading",
	name: "Reading",
	tree: null,
	filter,
	pinned: false,
	isBuiltIn: true,
	sortOrder: -3,
};
const userShelf: ShelfEntry = {
	...builtIn,
	id: "s1",
	name: "Short",
	tree: filterToTree(filter),
	isBuiltIn: false,
	sortOrder: 1,
};

let view: Rendered | undefined;
const setBuiltInPinned = vi.fn();
beforeEach(() => {
	vi.clearAllMocks();
	location = { pathname: "/tabs/library", search: {} };
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const labels = () =>
	[...(view?.container.querySelectorAll("button") ?? [])].map((b) => b.textContent);

describe("ShelfActions", () => {
	it("offers a built-in only Pin, kept on this device", async () => {
		view = await render(
			<ShelfActions shelf={builtIn} onClose={() => {}} setBuiltInPinned={setBuiltInPinned} />,
		);
		expect(labels()).toEqual(["Pin"]);
		await click(view.getButton("Pin"));
		expect(setBuiltInPinned).toHaveBeenCalledWith("builtin:reading", true);
		expect(updateShelf).not.toHaveBeenCalled();
	});

	it("offers a user shelf rename, edit, pin and delete; pin syncs", async () => {
		view = await render(
			<ShelfActions
				shelf={{ ...userShelf, pinned: true }}
				onClose={() => {}}
				setBuiltInPinned={setBuiltInPinned}
			/>,
		);
		expect(labels()).toEqual(["Rename", "Edit conditions…", "Unpin", "Delete shelf…"]);
		await click(view.getButton("Unpin"));
		expect(updateShelf).toHaveBeenCalledWith({ id: "s1", pinned: false });
	});

	it("deletes only after the confirm and leaves the shelf when it is open", async () => {
		location = { pathname: "/tabs/library", search: { shelf: "s1" } };
		view = await render(
			<ShelfActions shelf={userShelf} onClose={() => {}} setBuiltInPinned={setBuiltInPinned} />,
		);
		await click(view.getButton("Delete shelf…"));
		expect(deleteShelf).not.toHaveBeenCalled();
		expect(view.text()).toContain("Its books stay in your library.");
		await click(view.getButton("Confirm delete"));
		expect(deleteShelf).toHaveBeenCalledWith("s1");
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library", search: {} });
	});

	it("opens the editor on a shelf the chips cannot show", async () => {
		view = await render(
			<ShelfActions
				shelf={{ ...userShelf, filter: null }}
				onClose={() => {}}
				setBuiltInPinned={setBuiltInPinned}
			/>,
		);
		expect(view.container.querySelector("[data-testid=editor]")).toBeNull();
		await click(view.getButton("Edit conditions…"));
		expect(view.container.querySelector("[data-testid=editor]")?.textContent).toBe("Short");
		expect(navigate).not.toHaveBeenCalled();
	});

	it("cannot edit a shelf whose conditions this version cannot read", async () => {
		view = await render(
			<ShelfActions
				shelf={{ ...userShelf, tree: null, filter: null }}
				onClose={() => {}}
				setBuiltInPinned={setBuiltInPinned}
			/>,
		);
		expect(view.getButton("Edit conditions…").disabled).toBe(true);
	});

	it("closes the menu, then the delete confirm, on the Android back press", async () => {
		const onClose = vi.fn();
		view = await render(
			<ShelfActions shelf={userShelf} onClose={onClose} setBuiltInPinned={setBuiltInPinned} />,
		);
		expect(consumeBackPress()).toBe(true);
		expect(onClose).toHaveBeenCalledTimes(1);

		await click(view.getButton("Delete shelf…"));
		expect(view.text()).toContain("Its books stay in your library.");
		await act(async () => {
			expect(consumeBackPress()).toBe(true);
		});
		expect(view.text()).not.toContain("Its books stay in your library.");
		expect(deleteShelf).not.toHaveBeenCalled();
	});
});
