import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { click, type Rendered, render } from "../../../test/render";

const removeCollection = vi.fn();
const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useLocation: () => ({ pathname: "/tabs/library", search: {} }),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useMoveCollection: () => ({ mutate: vi.fn() }),
		useDeleteCollection: () => ({ mutate: removeCollection }),
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
		}) => (
			<MockOverlay open={p.open} onOpenChange={p.onOpenChange}>
				{p.description}
			</MockOverlay>
		),
	};
});

const { CollectionActions } = await import("../collection-actions");

const fantasy: CollectionWithCount = {
	id: "c1",
	name: "Fantasy",
	sortOrder: 1,
	ordered: false,
	seriesKey: null,
	deleted: false,
	createdAt: 1,
	updatedAt: 1,
	bookCount: 2,
};

let view: Rendered | undefined;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("CollectionActions", () => {
	it("closes the menu, then the delete confirm, on the Android back press", async () => {
		const onClose = vi.fn();
		view = await render(
			<CollectionActions collection={fantasy} collections={[fantasy]} onClose={onClose} />,
		);
		expect(consumeBackPress()).toBe(true);
		expect(onClose).toHaveBeenCalledTimes(1);

		await click(view.getButton("Delete collection"));
		expect(view.text()).toContain("Its books stay in your library.");
		await act(async () => {
			expect(consumeBackPress()).toBe(true);
		});
		expect(view.text()).not.toContain("Its books stay in your library.");
		expect(removeCollection).not.toHaveBeenCalled();
	});

	it("opens the collection page to edit, with no name sheet of its own", async () => {
		view = await render(
			<CollectionActions collection={fantasy} collections={[fantasy]} onClose={vi.fn()} />,
		);
		expect(view.queryButton("Rename")).toBeNull();
		await click(view.getButton("Edit collection"));
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/library/collections/$id/edit",
			params: { id: "c1" },
		});
	});

	it("leaves the back press to the router while nothing is open", async () => {
		view = await render(<CollectionActions collection={null} collections={[]} onClose={vi.fn()} />);
		expect(consumeBackPress()).toBe(false);
	});
});
