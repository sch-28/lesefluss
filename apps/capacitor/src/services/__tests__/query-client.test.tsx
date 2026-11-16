import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { isFirstLoad } from "../query-client";

/** The library's shape: a spinner while a query loads, and readers of the same query below it. */
async function renderSpinnerScreen(gate: (query: UseQueryResult) => boolean) {
	const queryFn = vi.fn(async (): Promise<string> => {
		throw new Error("Couldn't read row 0 column -1");
	});
	const options = { queryKey: ["probe"], queryFn };
	const Reader = () => {
		useQuery(options);
		return null;
	};
	const Screen = () => {
		const query = useQuery(options);
		return gate(query) ? <span>loading</span> : <Reader />;
	};
	const view = await render(<Screen />);
	await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
	view.unmount();
	return queryFn;
}

describe("isFirstLoad", () => {
	it("keeps a spinner screen over a failing query from refetching in a loop", async () => {
		const queryFn = await renderSpinnerScreen(isFirstLoad);
		// The first fetch, then the one retry the mounting reader asks for.
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("is needed: gating on isPending refetches on every remount", async () => {
		const queryFn = await renderSpinnerScreen((query) => query.isPending);
		expect(queryFn.mock.calls.length).toBeGreaterThan(5);
	});
});
