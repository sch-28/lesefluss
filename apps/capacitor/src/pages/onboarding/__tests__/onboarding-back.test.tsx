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

	it("offers Skip setup on every step but the last, whose Not now already finishes", async () => {
		view = await render(<Onboarding />);
		const seen: boolean[] = [];
		for (let i = 0; i < 7; i++) {
			seen.push(view.queryButton("Skip setup") !== null);
			if (i < 6) await click(view.getButton("Continue"));
		}
		expect(view.text()).toContain("Sync step");
		expect(seen).toEqual([true, true, true, true, true, true, false]);
	});
});

describe("onboarding layout", () => {
	it("centres every step, the speed test in a box of fixed height, and keeps the footer's rows in place", async () => {
		view = await render(<Onboarding />);
		const rows: string[][] = [];
		for (let i = 0; i < 7; i++) {
			const step = view.container.querySelector("[data-testid=onboarding-step]");
			expect(step?.className, `step ${i}`).toContain("my-auto");
			const isSpeed = view.text().includes("Speed step");
			expect(step?.className.includes("max-h-[43rem]"), `step ${i}`).toBe(isSpeed);
			const footer = view.container.querySelector("main")?.nextElementSibling?.firstElementChild;
			rows.push(
				[...(footer?.children ?? [])].map((el) =>
					el.tagName === "BUTTON"
						? "button"
						: el.classList.contains("invisible")
							? "hidden dots"
							: el.getAttribute("data-testid") === "onboarding-secondary-slot"
								? "empty slot"
								: "dots",
				),
			);
			if (i < 6) await click(view.getButton("Continue"));
		}
		expect(rows[0]).toEqual(["hidden dots", "button", "empty slot"]);
		for (const row of rows.slice(1)) {
			expect(row[0]).toBe("dots");
			expect(row).toHaveLength(3);
			expect(row[1]).toBe("button");
		}
	});
});
