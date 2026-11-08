import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";
import { OnboardingFooterContext } from "../footer-context";

const getLanding = vi.hoisted(() => vi.fn());

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	CATALOG_ENABLED: true,
	getLanding,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog: vi.fn() }));

const BooksStep = (await import("../steps/books")).default;

const footer = { next: vi.fn(), finish: vi.fn(), setFooter: vi.fn() };

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

describe("onboarding books step", () => {
	it("offers Retry when the catalog can't be reached, and shows the classics after it", async () => {
		getLanding.mockRejectedValue(new TypeError("Failed to fetch"));
		view = await render(
			<OnboardingFooterContext.Provider value={footer}>
				<BooksStep />
			</OnboardingFooterContext.Provider>,
		);
		await flush();
		expect(view.container.querySelectorAll('[role="alert"]')).toHaveLength(1);
		expect(view.text()).toContain("Couldn't connect");

		getLanding.mockResolvedValue({
			classics: [{ id: "gutenberg:84", title: "Frankenstein", author: null, coverUrl: null }],
		});
		await click(view.getButton("Retry"));
		await flush();
		expect(view.container.querySelector('[role="alert"]')).toBeNull();
		expect(view.text()).toContain("Frankenstein");
	});
});
