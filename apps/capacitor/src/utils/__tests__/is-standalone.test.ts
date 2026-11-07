import { afterEach, describe, expect, it, vi } from "vitest";
import { isStandalone } from "../platform";

function stubDisplayMode(standalone: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({ matches: standalone && query.includes("standalone") })),
	);
}

describe("isStandalone", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		Reflect.deleteProperty(navigator, "standalone");
	});

	it("is true in an iPhone Home Screen app", () => {
		stubDisplayMode(false);
		Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
		expect(isStandalone()).toBe(true);
	});

	it("is true in an installed desktop or Android app", () => {
		stubDisplayMode(true);
		expect(isStandalone()).toBe(true);
	});

	it("is false in a browser tab", () => {
		stubDisplayMode(false);
		expect(isStandalone()).toBe(false);
	});
});
