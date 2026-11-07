import type React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShelfEntry } from "../../../pages/library/smart-shelves";
import { consumeBackPress } from "../../../services/overlay-back";
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
vi.mock("@lesefluss/ui/drawer", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return {
		Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
			open ? <div>{children}</div> : null,
		DrawerContent: Pass,
		DrawerHeader: Pass,
		DrawerTitle: Pass,
	};
});
vi.mock("../../confirm-dialog", () => ({
	ConfirmDialog: (p: { open: boolean; description?: string; onConfirm: () => void }) =>
		p.open ? (
			<div>
				{p.description}
				<button type="button" onClick={p.onConfirm}>
					Confirm delete
				</button>
			</div>
		) : null,
}));
vi.mock("../../collections/collection-name-dialog", () => ({ CollectionNameDialog: () => null }));

const { ShelfActions } = await import("../shelf-actions");

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

	it("cannot edit a shelf whose conditions the chips cannot show", async () => {
		view = await render(
			<ShelfActions
				shelf={{ ...userShelf, filter: null }}
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
