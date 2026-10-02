import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { useQueryText } from "../use-query-text";

let latest: ReturnType<typeof useQueryText> | undefined;
function Harness({ urlQ, commit }: { urlQ?: string; commit: (q: string) => void }) {
	latest = useQueryText(urlQ, commit, 100);
	return <span>{latest.text}</span>;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
});

describe("useQueryText", () => {
	it("commits a settled value and keeps typing when the URL catches up late", async () => {
		vi.useFakeTimers();
		const commit = vi.fn();
		view = await render(<Harness commit={commit} />);

		act(() => latest?.setText("dun"));
		act(() => vi.advanceTimersByTime(150));
		expect(commit).toHaveBeenLastCalledWith("dun");

		act(() => latest?.setText("dune"));
		// The URL now reports the older "dun" while the box already says "dune".
		await view.rerender(<Harness urlQ="dun" commit={commit} />);
		expect(latest?.text).toBe("dune");
	});

	it("refills the box when the URL changes from outside", async () => {
		const commit = vi.fn();
		view = await render(<Harness urlQ="dracula" commit={commit} />);
		expect(latest?.text).toBe("dracula");
	});

	it("submits immediately without waiting for the debounce", async () => {
		const commit = vi.fn();
		view = await render(<Harness commit={commit} />);
		act(() => latest?.submit("  cradle "));
		expect(commit).toHaveBeenCalledWith("cradle");
		expect(latest?.text).toBe("  cradle ");
	});
});
