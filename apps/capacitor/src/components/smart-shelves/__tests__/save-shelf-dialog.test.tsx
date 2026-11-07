import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FACETS, type FacetValues, type LibraryFilter } from "../../../pages/library/filter-model";
import { click, type Rendered, render } from "../../../test/render";

const navigate = vi.fn();
const create = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: { useCreateSmartShelf: () => ({ mutate: create, isPending: false }) },
}));
vi.mock("../../entry-dialog", async () => ({
	EntryDialog: (await import("../../../test/overlay-mocks")).MockOverlay,
}));
vi.mock("../condition-chips", () => ({ ConditionChips: () => null }));

const facets = (status: string): FacetValues => ({
	...(Object.fromEntries(FACETS.map((f) => [f, []])) as unknown as FacetValues),
	status: [status],
	wordCount: 1000,
});
vi.mock("../../../pages/library/use-smart-shelves", () => ({
	useShelfLibrary: () => ({
		items: [
			{ facets: facets("reading") },
			{ facets: facets("reading") },
			{ facets: facets("finished") },
		],
		options: {},
	}),
}));

const { SaveShelfDialog } = await import("../save-shelf-dialog");

const reading: LibraryFilter = { status: { in: ["reading"], out: [] } };

let view: Rendered | undefined;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function typeName(value: string) {
	const input = view?.container.querySelector("input[aria-label='Shelf name']") as HTMLInputElement;
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("SaveShelfDialog", () => {
	it("shows the live count and needs a name", async () => {
		view = await render(<SaveShelfDialog open onOpenChange={() => {}} filter={reading} />);
		expect(view.container.querySelector("[data-testid='shelf-live-count']")?.textContent).toBe(
			"2 books match right now",
		);
		expect(view.getButton("Save").disabled).toBe(true);
		typeName("   ");
		expect(view.getButton("Save").disabled).toBe(true);
		typeName("Now reading");
		expect(view.getButton("Save").disabled).toBe(false);
	});

	it("cannot save without an active filter", async () => {
		view = await render(<SaveShelfDialog open onOpenChange={() => {}} filter={{}} />);
		typeName("Everything");
		expect(view.getButton("Save").disabled).toBe(true);
	});

	it("saves the conditions and opens the new shelf", async () => {
		const onOpenChange = vi.fn();
		create.mockImplementation((_input, opts: { onSuccess: (row: { id: string }) => void }) =>
			opts.onSuccess({ id: "new" }),
		);
		view = await render(<SaveShelfDialog open onOpenChange={onOpenChange} filter={reading} />);
		typeName(" Now reading ");
		await click(view.getButton("Save"));
		expect(create.mock.calls[0][0]).toMatchObject({ name: "Now reading", pinned: true });
		expect(JSON.parse(create.mock.calls[0][0].conditions)).toMatchObject({ v: 1 });
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "/tabs/library",
				search: expect.objectContaining({ shelf: "new" }),
			}),
		);
	});

	it("saves on the keyboard's action key, which submits the form without an Enter keydown", async () => {
		view = await render(<SaveShelfDialog open onOpenChange={() => {}} filter={reading} />);
		typeName("Now reading");
		const input = view.container.querySelector("input[aria-label='Shelf name']");
		expect(input?.getAttribute("enterkeyhint")).toBe("done");
		act(() => {
			input
				?.closest("form")
				?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		expect(create.mock.calls[0][0]).toMatchObject({ name: "Now reading" });
	});

	it("closes on the Android back press instead of navigating the page beneath", async () => {
		const onOpenChange = vi.fn();
		view = await render(<SaveShelfDialog open onOpenChange={onOpenChange} filter={reading} />);
		expect(consumeBackPress()).toBe(true);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
