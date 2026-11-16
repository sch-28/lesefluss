import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { readRecentSearches, recordRecentSearch } from "../recent-searches";

const { default: SearchField } = await import("../search-field");

let view: Rendered | undefined;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	localStorage.clear();
	recordRecentSearch("ghosts");
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
});

const recentList = () => view?.container.querySelector('[aria-label="Recent searches"]');

describe("SearchField", () => {
	it("keeps recent searches open when the field is focused again right after a blur (pressing Clear)", async () => {
		view = await render(<SearchField value="" onChange={() => {}} onSubmit={() => {}} />);
		const input = view.container.querySelector("input") as HTMLInputElement;
		act(() => input.focus());
		expect(recentList()).not.toBeNull();

		act(() => input.blur());
		act(() => input.focus());
		act(() => vi.advanceTimersByTime(200));
		expect(recentList()).not.toBeNull();
	});

	it("closes recent searches once the field has lost focus", async () => {
		view = await render(<SearchField value="" onChange={() => {}} onSubmit={() => {}} />);
		const input = view.container.querySelector("input") as HTMLInputElement;
		act(() => input.focus());
		act(() => input.blur());
		act(() => vi.advanceTimersByTime(200));
		expect(recentList()).toBeNull();
	});

	it("takes its own label and keeps web-novel queries out of the recent searches", async () => {
		const onSubmit = vi.fn();
		view = await render(
			<SearchField
				value="cradle"
				onChange={() => {}}
				onSubmit={onSubmit}
				label="Search web novels"
				placeholder="e.g. Cradle"
				hasRecents={false}
			/>,
		);
		const input = view.container.querySelector("input") as HTMLInputElement;
		expect(input.getAttribute("aria-label")).toBe("Search web novels");
		expect(input.placeholder).toBe("e.g. Cradle");
		act(() => {
			input.focus();
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(onSubmit).toHaveBeenCalledWith("cradle");
		expect(readRecentSearches()).not.toContain("cradle");
	});

	it("never opens Explore's recent searches on a field without them", async () => {
		view = await render(
			<SearchField value="" onChange={() => {}} onSubmit={() => {}} hasRecents={false} />,
		);
		const input = view.container.querySelector("input") as HTMLInputElement;
		act(() => input.focus());
		expect(recentList()).toBeNull();
	});
});
