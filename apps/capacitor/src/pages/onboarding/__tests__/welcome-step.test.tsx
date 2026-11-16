import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { OnboardingFooterContext } from "../footer-context";
import WelcomeStep from "../steps/welcome";

const footer = { next: vi.fn(), finish: vi.fn(), setFooter: vi.fn() };

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("onboarding welcome step", () => {
	it("pitches every way to read, not RSVP alone", async () => {
		view = await render(
			<OnboardingFooterContext.Provider value={footer}>
				<WelcomeStep />
			</OnboardingFooterContext.Provider>,
		);
		const text = view.text();
		expect(text).toContain("pages, scrolling or one word at a time");
		expect(text).not.toContain("Read faster");
		expect(footer.setFooter).toHaveBeenCalledWith({
			primary: { label: "Get started", onClick: footer.next },
		});
	});
});
