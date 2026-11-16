import { DEFAULT_SETTINGS } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

const updateSetting = vi.hoisted(() => vi.fn());
vi.mock("../../../hooks/use-auto-save-settings", () => ({
	useAutoSaveSettings: () => ({ settings: DEFAULT_SETTINGS, updateSetting }),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useSpeedTests: () => ({ data: [] }),
		useSaveSpeedTest: () => ({ mutate: vi.fn() }),
		useLastReadBookId: () => ({ data: null }),
		useBook: () => ({ data: undefined }),
	},
}));

vi.mock("../rsvp-round", () => ({ RsvpRound: () => null }));

const { SpeedTest } = await import("../speed-test");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function button(label: string): HTMLElement {
	const found = [...document.querySelectorAll<HTMLElement>("button")].find(
		(el) => el.textContent?.trim() === label,
	);
	if (!found) throw new Error(`no button ${label}`);
	return found;
}

/** Start, read the passage at a plausible pace, skip the RSVP round, then finish on the result. */
async function runToFinish(finishLabel: string) {
	let now = 1_000_000;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	await click(button("Start"));
	const veil = [...document.querySelectorAll<HTMLElement>("button")].find((el) =>
		el.textContent?.includes("Tap to begin"),
	);
	if (!veil) throw new Error("no veil");
	await click(veil);
	now += 60_000;
	await click(button("Done"));
	await click(button("Skip round"));
	expect(document.querySelector("[data-testid=speed-test-result]")).not.toBeNull();
	await click(button(finishLabel));
}

describe("SpeedTest", () => {
	it("offers the skip during the reading round", async () => {
		const onSkip = vi.fn();
		view = await render(
			<SpeedTest
				onSkip={onSkip}
				onFinish={vi.fn()}
				skipLabel="Skip this step"
				finishLabel="Continue"
			/>,
		);
		await click(button("Start"));
		expect(view.container.querySelector("[data-testid=speed-test-passage]")).not.toBeNull();
		await click(button("Skip this step"));
		expect(onSkip).toHaveBeenCalledOnce();
	});

	it("leaves the RSVP wpm alone when a retest finishes", async () => {
		const onFinish = vi.fn();
		view = await render(
			<SpeedTest onSkip={vi.fn()} onFinish={onFinish} skipLabel="Not now" finishLabel="Done" />,
		);
		await runToFinish("Done");
		expect(onFinish).toHaveBeenCalledOnce();
		expect(updateSetting).not.toHaveBeenCalled();
	});

	it("sets the RSVP wpm on finish where the host asks for it, as onboarding does", async () => {
		view = await render(
			<SpeedTest
				onSkip={vi.fn()}
				onFinish={vi.fn()}
				skipLabel="Skip this step"
				finishLabel="Continue"
				applyDialOnFinish
			/>,
		);
		await runToFinish("Continue");
		expect(updateSetting).toHaveBeenCalledWith("wpm", expect.any(Number));
	});
});
