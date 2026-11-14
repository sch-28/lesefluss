import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import Onboarding from "..";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock("../../../hooks/use-auto-save-settings", () => ({
	useAutoSaveSettings: () => ({
		settings: { defaultReaderMode: "page", einkMode: false },
		updateSetting: vi.fn(),
		flush: vi.fn(),
	}),
}));
vi.mock("../../../services/deep-links/use-deep-links", () => ({ replayPendingLink: vi.fn() }));
vi.mock("../../../services/social/buddy-reads", () => ({ buddyReadExists: vi.fn() }));
vi.mock("../steps/welcome", () => ({ default: () => <p>Welcome step</p> }));
vi.mock("../steps/theme", () => ({ default: () => <p>Theme step</p> }));
vi.mock("../steps/speed", () => ({ default: () => <p>Speed step</p> }));
vi.mock("../steps/reader-mode", () => ({ default: () => <p>Reader mode step</p> }));
vi.mock("../steps/pagination-style", () => ({ default: () => <p>Pagination step</p> }));
vi.mock("../steps/books", () => ({ default: () => <p>Books step</p> }));
vi.mock("../steps/sync", () => ({ default: () => <p>Sync step</p> }));

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const pressBack = () => {
	let consumed = false;
	act(() => {
		consumed = consumeBackPress();
	});
	return consumed;
};

describe("onboarding Android back", () => {
	it("goes one step back, and leaves the first step to the router", async () => {
		view = await render(<Onboarding />);
		expect(view.text()).toContain("Welcome step");
		expect(pressBack()).toBe(false);

		await click(view.getButton("Continue"));
		await click(view.getButton("Continue"));
		expect(view.text()).toContain("Speed step");

		expect(pressBack()).toBe(true);
		expect(view.text()).toContain("Theme step");
		expect(pressBack()).toBe(true);
		expect(view.text()).toContain("Welcome step");
		expect(pressBack()).toBe(false);
	});
});
