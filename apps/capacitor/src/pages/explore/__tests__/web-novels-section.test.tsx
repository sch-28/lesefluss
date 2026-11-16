import { afterEach, describe, expect, it, vi } from "vitest";
import { expectListsHoldOnlyItems } from "../../../test/list-items";
import { type Rendered, render } from "../../../test/render";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { default: WebNovelsSection } = await import("../web-novels-section");
const { VISIBLE_PROVIDERS } = await import("../web-novels-providers");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("WebNovelsSection", () => {
	it("exposes the provider row as a list named Web novels, one item per provider", async () => {
		view = await render(<WebNovelsSection />);
		expectListsHoldOnlyItems(view.container);
		const list = view.container.querySelector('ul[role="list"]');
		const labelId = list?.getAttribute("aria-labelledby") ?? "";
		expect(document.getElementById(labelId)?.textContent).toBe("Web novels");
		expect(list?.children).toHaveLength(VISIBLE_PROVIDERS.length);
	});
});
