import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { click, type Rendered, render } from "../../../test/render";

const removeCollection = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useLocation: () => ({ pathname: "/tabs/library", search: {} }),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useRenameCollection: () => ({ mutate: vi.fn() }),
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
vi.mock("../collection-name-dialog", () => ({ CollectionNameDialog: () => null }));

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

	it("leaves the back press to the router while nothing is open", async () => {
		view = await render(<CollectionActions collection={null} collections={[]} onClose={vi.fn()} />);
		expect(consumeBackPress()).toBe(false);
	});
});
