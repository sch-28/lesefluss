import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { recordRecentSearch } from "../recent-searches";

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
});
