import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const { DetailShell } = await import("../detail-shell");

const tags = Array.from({ length: 11 }, (_, i) => ({ id: `tag-${i}`, label: `Tag ${i}` }));

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const renderShell = (onTagTap = vi.fn()) =>
	render(
		<DetailShell
			cover={null}
			title="Book"
			subjects={["Raw subject"]}
			tagLinks={{ tags, onTap: onTagTap }}
			primaryAction={{ label: "Read now", onClick: vi.fn() }}
		/>,
	);

describe("DetailShell tags", () => {
	it("collapses long tag lists behind 'more' and expands to all of them", async () => {
		view = await renderShell();
		const list = () => view?.container.querySelector('[data-testid="detail-tags"]');
		expect(list()?.textContent).toContain("Tag 7");
		expect(list()?.textContent).not.toContain("Tag 8");
		await click(view.getButton("3 more"));
		expect(list()?.textContent).toContain("Tag 10");
		expect(view.queryButton("3 more")).toBeNull();
	});

	it("reports the tapped tag id and replaces raw subjects", async () => {
		const onTagTap = vi.fn();
		view = await renderShell(onTagTap);
		await click(view.getButton("Tag 2"));
		expect(onTagTap).toHaveBeenCalledWith("tag-2");
		expect(view.text()).not.toContain("Raw subject");
	});
});
