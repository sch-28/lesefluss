import { EINK_CLASS, usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

function Probe() {
	return <output>{usePrefersReducedMotion() ? "reduced" : "full"}</output>;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.documentElement.classList.remove(EINK_CLASS);
	vi.unstubAllGlobals();
});

function stubSystemPreference(isReduced: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches: isReduced,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
}

/** MutationObserver callbacks are microtasks; let them and the re-render run. */
async function settle() {
	await act(async () => {
		await Promise.resolve();
	});
}

describe("usePrefersReducedMotion in e-ink mode", () => {
	it("reports reduced motion while the root has the eink class, whatever the system says", async () => {
		stubSystemPreference(false);
		view = await render(<Probe />);
		expect(view.text()).toBe("full");

		document.documentElement.classList.add(EINK_CLASS);
		await settle();
		expect(view.text()).toBe("reduced");

		document.documentElement.classList.remove(EINK_CLASS);
		await settle();
		expect(view.text()).toBe("full");
	});

	it("still follows the system preference without e-ink mode", async () => {
		stubSystemPreference(true);
		view = await render(<Probe />);
		expect(view.text()).toBe("reduced");
	});
});
