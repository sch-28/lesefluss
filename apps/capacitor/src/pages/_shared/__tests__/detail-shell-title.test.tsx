import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

const { DetailShell } = await import("../detail-shell");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const headerTitle = () => view?.container.querySelector("header")?.textContent;

describe("DetailShell title", () => {
	it("names the page in the header at rest, beside the hero's own heading", async () => {
		view = await render(
			<DetailShell cover={null} title="Dune" primaryAction={{ label: "Read", onClick: vi.fn() }} />,
		);
		expect(headerTitle()).toBe("Dune");
		expect(view.container.querySelector("section h2")?.textContent).toBe("Dune");
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
		expect(headerTitle()).toBe("Book not found");
	});
});
