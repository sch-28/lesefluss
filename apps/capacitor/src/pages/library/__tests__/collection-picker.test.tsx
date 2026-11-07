import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../services/db/schema";
import { consumeBackPress } from "../../../services/overlay-back";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useCollections: () => ({ data: [] }),
		useCollectionIdsForBook: () => ({ data: [] }),
		useAddBooksToCollection: () => ({ mutate: vi.fn() }),
		useRemoveBooksFromCollection: () => ({ mutate: vi.fn() }),
		useCreateCollection: () => ({ mutate: vi.fn() }),
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

const { default: CollectionPicker } = await import("../collection-picker");

const book = { id: "b1", title: "Dune" } as Book;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("CollectionPicker", () => {
	it("closes on the Android back press instead of navigating the page beneath", async () => {
		const onClose = vi.fn();
		view = await render(<CollectionPicker book={book} onClose={onClose} />);
		expect(consumeBackPress()).toBe(true);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("leaves the back press to the router while closed", async () => {
		view = await render(<CollectionPicker book={null} onClose={vi.fn()} />);
		expect(consumeBackPress()).toBe(false);
	});
});
