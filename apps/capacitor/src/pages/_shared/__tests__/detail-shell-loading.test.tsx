import { Share2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ right }: { right?: React.ReactNode }) => <header>{right}</header>,
}));

const { DetailShell } = await import("../detail-shell");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("DetailShell loading", () => {
	it("draws the loaded frame with the cover's place and a disabled header action", async () => {
		view = await render(
			<DetailShell
				cover={null}
				title=""
				isLoading
				primaryAction={{ label: "Read", onClick: vi.fn() }}
				headerActions={[{ icon: Share2, label: "Share", onClick: vi.fn(), disabled: true }]}
			/>,
		);
		const busy = view.container.querySelector('[aria-busy="true"]');
		expect(busy?.querySelector(".aspect-2\\/3")).not.toBeNull();
		expect(busy?.querySelector(".animate-spin")).not.toBeNull();
		expect(view.getButton("Share").disabled).toBe(true);
		expect(view.container.querySelector("h1")).toBeNull();
	});
});
