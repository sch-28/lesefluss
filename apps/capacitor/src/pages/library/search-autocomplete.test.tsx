import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { click, type Rendered, render } from "../../test/render";
import { FACETS, type LibraryFilter } from "./filter-model";
import type { FacetOptions } from "./filter-picker";
import { SearchAutocomplete } from "./search-autocomplete";

const options = {
	...(Object.fromEntries(FACETS.map((f) => [f, []])) as unknown as FacetOptions),
	tags: [{ value: "fantasy", label: "fantasy", count: 2 }],
	status: [{ value: "finished", label: "Finished", count: 1 }],
};

let state: { text: string; filter: LibraryFilter };

function Harness({ initial = {} }: { initial?: LibraryFilter }) {
	const [text, setText] = useState("");
	const [filter, setFilter] = useState<LibraryFilter>(initial);
	state = { text, filter };
	return (
		<SearchAutocomplete
			value={text}
			onValueChange={setText}
			filter={filter}
			onFilterChange={setFilter}
			options={options}
		/>
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const input = () => view?.container.querySelector("input") as HTMLInputElement;

function type(value: string) {
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input(), value);
		input().dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function press(key: string) {
	act(() => {
		input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});
}

describe("SearchAutocomplete", () => {
	it("turns a token into a chip on space and keeps plain text", async () => {
		view = await render(<Harness />);
		type("dune status:finished ");
		expect(state.filter).toEqual({ status: { in: ["finished"], out: [] } });
		expect(state.text).toBe("dune ");
	});

	it("commits on Enter, and a picked value suggestion becomes a chip", async () => {
		view = await render(<Harness />);
		type("-tag:fantasy");
		press("Enter");
		expect(state.filter.tags?.out).toEqual(["fantasy"]);

		type("tag:fan");
		const suggestion = view.container.querySelector<HTMLButtonElement>('[role="option"]');
		expect(suggestion?.textContent).toContain("fantasy");
		await click(suggestion as HTMLButtonElement);
		expect(state.filter.tags?.in).toEqual(["fantasy"]);
		expect(state.text).toBe("");
	});

	it("Backspace on an empty box removes the last chip", async () => {
		view = await render(
			<Harness initial={{ tags: { in: ["fantasy"], out: [] }, words: { max: 50_000 } }} />,
		);
		press("Backspace");
		expect(state.filter).toEqual({ tags: { in: ["fantasy"], out: [] } });
		press("Backspace");
		expect(state.filter).toEqual({});
	});

	it("leaves an unknown value as text", async () => {
		view = await render(<Harness />);
		type("tag:nope ");
		expect(state.filter).toEqual({});
		expect(state.text).toBe("tag:nope ");
	});
});
