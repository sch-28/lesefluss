import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { type OnboardingFooter, OnboardingFooterContext } from "../footer-context";

const updateSetting = vi.fn();
const saveTest = vi.fn();
const next = vi.fn();
const settings = {
	wpm: 350,
	delayComma: 2,
	delayPeriod: 3,
	accelStart: 2,
	accelRate: 0.1,
	xOffset: 30,
	focalLetterColor: "#ff0000",
};

vi.mock("../../../hooks/use-auto-save-settings", () => ({
	useAutoSaveSettings: () => ({ settings, updateSetting }),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useSpeedTests: () => ({ data: [] }),
		useSaveSpeedTest: () => ({ mutate: saveTest }),
		useLastReadBookId: () => ({ data: null }),
		useBook: () => ({ data: undefined }),
	},
}));
vi.mock("../../../contexts/theme-context", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../contexts/theme-context")>()),
	useTheme: () => ({ theme: "light", isEinkMode: false }),
}));
vi.mock("../../settings/rsvp-preview", () => ({ default: () => <div>rsvp preview</div> }));

const SpeedStep = (await import("../steps/speed")).default;
const { RSVP_WPM_RANGE, steppedWpm } = await import("../../reader/wpm");
const { SpeedTestResult } = await import("../../../components/speed-test/result");
const { SpeedGauge } = await import("../../../components/speed-test/gauge");
const { SPEED_TEST_PASSAGES } = await import("../../../components/speed-test/passages");
const { MIN_RSVP_WORDS, rsvpDelays, rsvpWpm, suggestDial } = await import(
	"../../../services/stats/speed-test"
);

/** Stands in for the onboarding shell: renders whatever footer the step sets. */
function Shell({ children }: { children: React.ReactNode }) {
	const [footer, setFooter] = useState<OnboardingFooter | null>(null);
	return (
		<OnboardingFooterContext.Provider value={{ next, finish: async () => {}, setFooter }}>
			{children}
			{footer && (
				<footer>
					<button type="button" onClick={footer.primary.onClick} disabled={footer.primary.disabled}>
						{footer.primary.label}
					</button>
					{footer.secondary && (
						<button type="button" onClick={footer.secondary.onClick}>
							{footer.secondary.label}
						</button>
					)}
				</footer>
			)}
		</OnboardingFooterContext.Provider>
	);
}

let clock = 0;
let view: Rendered | undefined;
beforeEach(() => {
	clock = 1_000_000;
	vi.spyOn(Date, "now").mockImplementation(() => clock);
	updateSetting.mockClear();
	saveTest.mockClear();
	next.mockClear();
});
afterEach(() => {
	vi.restoreAllMocks();
	view?.unmount();
	view = undefined;
});

async function mount() {
	view = await render(
		<Shell>
			<SpeedStep />
		</Shell>,
	);
	return view;
}

describe("onboarding speed step", () => {
	it("skips to the shared RSVP speed control and saves its value", async () => {
		const v = await mount();
		await click(v.getButton("Skip this step"));
		expect(v.queryButton("Start")).toBeNull();
		expect(v.container.querySelector("[data-testid=rsvp-wpm-value]")?.textContent).toBe("350");
		await click(v.getButton("Increase speed"));
		expect(updateSetting).toHaveBeenCalledWith("wpm", steppedWpm(350, RSVP_WPM_RANGE, 1));
	});

	it("measures both rounds, saves the test and applies the suggested dial", async () => {
		const v = await mount();
		await click(v.getButton("Start"));
		expect(v.getButton("Done").disabled).toBe(true);
		await click(v.getButton(/Tap to begin/));
		const passage = SPEED_TEST_PASSAGES.find((p) => v.text().includes(p.read[0] ?? ""));
		const words = passage?.read.join(" ").split(/\s+/).length ?? 0;
		clock += 60_000;
		await click(v.getButton("Done"));
		expect(v.container.querySelector("[data-testid=speed-test-rsvp-stage]")).not.toBeNull();
		await click(v.getButton("Skip round"));

		expect(saveTest).toHaveBeenCalledWith({
			readingWpm: words,
			rsvpWpm: null,
			passageId: passage?.id,
		});
		const dial = Math.min(700, Math.max(300, Math.round((words * 1.5) / 25) * 25));
		await click(v.getButton(`Use RSVP ${dial}`));
		expect(updateSetting).toHaveBeenCalledWith("wpm", dial);
		expect(v.getButton(/RSVP \d+ set/).disabled).toBe(true);
		await click(v.getButton("Continue"));
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("plays the RSVP round and saves its speed", async () => {
		const v = await mount();
		await click(v.getButton("Start"));
		await click(v.getButton(/Tap to begin/));
		const passage = SPEED_TEST_PASSAGES.find((p) => v.text().includes(p.read[0] ?? ""));
		const readingWpm = passage?.read.join(" ").split(/\s+/).length ?? 0;
		clock += 60_000;
		await click(v.getButton("Done"));

		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			await act(async () => v.getButton("Play").click());
			for (let i = 0; i < MIN_RSVP_WORDS + 2; i++) {
				await act(async () => {
					vi.advanceTimersToNextTimer();
				});
			}
			await act(async () => v.getButton("Pause").click());
		} finally {
			vi.useRealTimers();
		}
		await click(v.getButton("See result"));

		const words = passage?.rsvp.split(/\s+/) ?? [];
		const delays = rsvpDelays(words, { ...settings, wpm: suggestDial(readingWpm) });
		expect(saveTest).toHaveBeenCalledWith({
			readingWpm,
			rsvpWpm: rsvpWpm(delays, MIN_RSVP_WORDS + 2),
			passageId: passage?.id,
		});
		expect(saveTest.mock.calls[0]?.[0].rsvpWpm).toBeGreaterThan(0);
	});

	it("keeps an implausible reading on request", async () => {
		const v = await mount();
		await click(v.getButton("Start"));
		await click(v.getButton(/Tap to begin/));
		clock += 5_000;
		await click(v.getButton("Done"));
		await click(v.getButton("Keep result"));
		expect(v.container.querySelector("[data-testid=speed-test-rsvp-stage]")).not.toBeNull();
		await click(v.getButton("Skip round"));
		expect(saveTest).toHaveBeenCalledOnce();
		expect(saveTest.mock.calls[0]?.[0].readingWpm).toBeGreaterThan(900);
	});

	it("offers a retry for an implausible reading speed", async () => {
		const v = await mount();
		await click(v.getButton("Start"));
		await click(v.getButton(/Tap to begin/));
		const first = SPEED_TEST_PASSAGES.find((p) => v.text().includes(p.read[0] ?? ""));
		clock += 5_000;
		await click(v.getButton("Done"));
		expect(v.container.querySelector("[data-testid=speed-test-implausible]")).not.toBeNull();
		await click(v.getButton("Try again"));
		expect(v.getButton("Done").disabled).toBe(true);
		expect(v.text(), "a fresh passage").not.toContain(first?.read[0]);
	});

	it("applies the suggested dial on Continue, without Use RSVP", async () => {
		const v = await mount();
		await click(v.getButton("Start"));
		await click(v.getButton(/Tap to begin/));
		const passage = SPEED_TEST_PASSAGES.find((p) => v.text().includes(p.read[0] ?? ""));
		const words = passage?.read.join(" ").split(/\s+/).length ?? 0;
		clock += 60_000;
		await click(v.getButton("Done"));
		await click(v.getButton("Skip round"));
		expect(updateSetting).not.toHaveBeenCalled();
		await click(v.getButton("Continue"));
		expect(updateSetting).toHaveBeenCalledWith("wpm", suggestDial(words));
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("shows no saved time or speed-up for a skipped RSVP round", async () => {
		const v = await mount();
		await click(v.getButton("Start"));
		await click(v.getButton(/Tap to begin/));
		clock += 60_000;
		await click(v.getButton("Done"));
		await click(v.getButton("Skip round"));
		const result = v.container.querySelector("[data-testid=speed-test-result]");
		expect(result?.querySelector("dl")?.textContent).toMatch(/RSVP wpm–Faster–$/);
		expect(v.container.querySelector("[data-testid=speed-test-book]")?.textContent).toMatch(
			/RSVP–Saved–$/,
		);
	});

	it("shows no negative speed-up for a reader faster than RSVP", async () => {
		view = await render(
			<SpeedTestResult
				readingWpm={800}
				rsvpWpm={440}
				dial={700}
				appliedDial={null}
				onDialChange={() => {}}
				onApply={() => {}}
			/>,
		);
		expect(view.text()).not.toMatch(/-\d/);
		expect(view.container.querySelector("[data-testid=speed-test-book]")?.textContent).toMatch(
			/Saved–$/,
		);
	});

	it("fits a reading above 800 on the gauge", async () => {
		view = await render(<SpeedGauge reading={850} value="850" label="wpm" animate={false} />);
		const arc = view.container.querySelector("[data-testid=gauge-reading]");
		expect(arc?.getAttribute("stroke-dasharray")).toBe("850 900");
		expect(arc?.getAttribute("pathLength")).toBe("900");
	});
});
