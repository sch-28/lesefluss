import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title, titleShown }: { title: string; titleShown?: boolean }) => (
		<header data-title-shown={String(titleShown)}>{title}</header>
	),
}));

const { DetailShell } = await import("../detail-shell");

let report: ((isIntersecting: boolean) => void) | undefined;
beforeEach(() => {
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
				report = (isIntersecting) => cb([{ isIntersecting }]);
			}
			observe() {}
			disconnect() {}
		},
	);
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	report = undefined;
	vi.unstubAllGlobals();
});

const headerShown = () => view?.container.querySelector("header")?.dataset.titleShown;

describe("DetailShell title", () => {
	it("keeps the header title hidden until the hero heading scrolls away, the heading staying in place", async () => {
		view = await render(
			<DetailShell cover={null} title="Dune" primaryAction={{ label: "Read", onClick: vi.fn() }} />,
		);
		expect(view.container.querySelector("h1")?.textContent).toBe("Dune");
		expect(headerShown()).toBe("false");
		act(() => report?.(false));
		expect(headerShown()).toBe("true");
		act(() => report?.(true));
		expect(headerShown()).toBe("false");
		expect(view.container.querySelector("h1")?.textContent).toBe("Dune");
	});

	it("offers the primary action as the way on from an error", async () => {
		const back = vi.fn();
		view = await render(
			<DetailShell
				cover={null}
				title="Book not found"
				errorMessage="Book not found."
				primaryAction={{ label: "Back to library", onClick: back }}
			/>,
		);
		expect(view.text()).toContain("Book not found.");
		await click(view.getButton("Back to library"));
		expect(back).toHaveBeenCalledTimes(1);
		expect(headerShown()).toBe("undefined");
	});
});
