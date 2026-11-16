import type { SpeedModel } from "@lesefluss/core";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { chipParts, modeMix } from "../speed-chip-model";

const mutate = vi.fn();
const state: {
	model: SpeedModel | undefined;
	earlier: SpeedModel | undefined;
	settings: { wpm: number; defaultReaderMode: string };
} = {
	model: undefined,
	earlier: undefined,
	settings: { wpm: 400, defaultReaderMode: "scroll" },
};

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: state.model }),
		useStatsSpeedModelEarlier: () => ({ data: state.earlier }),
		useSettings: () => ({ data: state.settings }),
		useSaveSettings: () => ({ mutate }),
		useStatsWpmTrend: (_window: string, mode: string) => ({
			data: {
				granularity: "day",
				measured:
					mode === "rsvp"
						? [
								{ bucketStart: new Date(2026, 9, 1).getTime(), avgWpm: 400 },
								{ bucketStart: new Date(2026, 9, 8).getTime(), avgWpm: 420 },
							]
						: [
								{ bucketStart: new Date(2026, 9, 1).getTime(), avgWpm: 280 },
								{ bucketStart: new Date(2026, 9, 8).getTime(), avgWpm: 260 },
							],
				target: [],
			},
		}),
	},
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		search,
		onClick,
	}: {
		children: React.ReactNode;
		to: string;
		search?: Record<string, string>;
		onClick?: () => void;
	}) => (
		<a href={search ? `${to}?${new URLSearchParams(search)}` : to} onClick={onClick}>
			{children}
		</a>
	),
}));

const { SpeedChip } = await import("../speed-chip");
const { SpeedDetails } = await import("../speed-details");

const HOUR = 3_600_000;

function model(over: { rsvp?: boolean; reading?: boolean } = {}): SpeedModel {
	const reading = over.reading ?? true;
	const rsvp = over.rsvp ?? false;
	return {
		window: "recent",
		reading: {
			wpm: 260,
			source: "measured",
			scroll: reading ? { wpm: 260, words: 78_000, activeMs: 5 * HOUR } : null,
			page: null,
			words: reading ? 78_000 : 0,
			activeMs: reading ? 5 * HOUR : 0,
		},
		rsvp: rsvp
			? { wpm: 420, words: 50_400, activeMs: 2 * HOUR, dialWpm: 450, deliveredRatio: 0.9 }
			: null,
		pace: { wpm: 300, source: "measured" },
		modesUsed: { reading, rsvp },
		sittings: 12,
		books: {},
	};
}

const chipText = (r: Rendered) =>
	r.container.querySelector("[data-testid=speed-chip]")?.textContent ?? "";
const details = () => document.querySelector("[data-testid=speed-details]");

let rendered: Rendered | undefined;
beforeEach(() => {
	mutate.mockClear();
	state.earlier = undefined;
	state.settings = { wpm: 400, defaultReaderMode: "scroll" };
});
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

describe("chipParts", () => {
	it("leads with the primary mode and leaves out a mode without a speed", () => {
		expect(chipParts({ reading: 260, rsvp: 420 })).toEqual([
			{ mode: "reading", wpm: 260 },
			{ mode: "rsvp", wpm: 420 },
		]);
		expect(chipParts({ reading: 260, rsvp: 420 }, "rsvp").map((p) => p.mode)).toEqual([
			"rsvp",
			"reading",
		]);
		expect(chipParts({ reading: 260 })).toEqual([{ mode: "reading", wpm: 260 }]);
		expect(chipParts({})).toEqual([]);
	});
});

describe("modeMix", () => {
	it("splits the words between the modes, only when both were read", () => {
		expect(modeMix(model({ rsvp: true }))).toEqual({ reading: 61, rsvp: 39 });
		expect(modeMix(model())).toBeNull();
	});
});

describe("SpeedChip", () => {
	it("shows one number and no RSVP for a scroll-only reader", async () => {
		state.model = model();
		rendered = await render(<SpeedChip />);
		expect(chipText(rendered)).toBe("Reading 260 wpm");

		await click(rendered.getButton(/260/));
		expect(details()?.textContent).toContain("Reading");
		expect(details()?.textContent).not.toContain("RSVP");
	});

	it("orders both speeds by the default reader mode", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(<SpeedChip />);
		expect(chipText(rendered)).toBe("Reading 260 wpm·RSVP 420");
		rendered.unmount();

		state.settings = { wpm: 400, defaultReaderMode: "rsvp" };
		rendered = await render(<SpeedChip />);
		expect(chipText(rendered)).toBe("RSVP 420 wpm·Reading 260");
	});

	it("opens a popover: the big number, a row per mode with its trend, the window, the details link", async () => {
		state.model = model({ rsvp: true });
		const then = model({ rsvp: true });
		state.earlier = {
			...then,
			reading: { ...then.reading, wpm: 280 },
			rsvp: then.rsvp && { ...then.rsvp, wpm: 400 },
		};
		rendered = await render(<SpeedChip />);
		await click(rendered.getButton(/260/));
		const q = (id: string) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? "";
		expect(q("speed-big")).toBe("260wpm Reading");
		expect(q("speed-row-reading")).toContain("260 wpm");
		expect(q("speed-row-reading")).toContain("−20 in 4 weeks");
		expect(q("speed-row-rsvp")).toContain("420 wpm");
		expect(q("speed-row-rsvp")).toContain("+20 in 4 weeks");
		expect(q("speed-row-rsvp")).toContain("Avg dial 450");
		expect(document.querySelectorAll("[data-testid^=speed-row-] svg")).toHaveLength(2);
		expect(details()?.textContent).toContain("Last 10h");
		expect(details()?.textContent).not.toContain("Pace");
		expect(
			document.querySelector("[role=dialog]")?.closest("[data-slot=popover-content]"),
		).not.toBeNull();
		expect(document.querySelector("a[href='/tabs/stats?tab=speed']")?.textContent).toContain(
			"Speed details",
		);
	});

	it("hands the tap to onOpen instead of opening the popover", async () => {
		state.model = model();
		const onOpen = vi.fn();
		rendered = await render(<SpeedChip onOpen={onOpen} />);
		await click(rendered.getButton(/260/));
		expect(onOpen).toHaveBeenCalledOnce();
		expect(details()).toBeNull();
	});
});

describe("SpeedDetails dial", () => {
	it("steps the global dial by 25, saves it and updates the RSVP estimate at once", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(
			<SpeedDetails
				model={state.model}
				dialWpm={400}
				showDial
				primary="reading"
				book={{ id: "b1", wordsLeft: 36_000 }}
				onNavigate={() => {}}
			/>,
		);
		const dial = () =>
			rendered?.container.querySelector("[data-testid=rsvp-wpm-value]")?.textContent;
		expect(rendered.text()).toContain("RSVP at dial360 wpm");

		await click(rendered.getButton("Increase speed"));
		await click(rendered.getButton("Increase speed"));
		expect(dial()).toBe("450");
		expect(mutate.mock.calls).toEqual([[{ wpm: 425 }], [{ wpm: 450 }]]);
		expect(rendered.text()).toContain("RSVP at dial405 wpm");

		await click(rendered.getButton("Decrease speed"));
		expect(mutate).toHaveBeenLastCalledWith({ wpm: 425 });
	});

	it("stops at the dial's limits without saving", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(
			<SpeedDetails
				model={state.model}
				dialWpm={1000}
				showDial
				primary="reading"
				onNavigate={() => {}}
			/>,
		);
		expect(rendered.getButton("Increase speed").getAttribute("aria-disabled")).toBe("true");
		await click(rendered.getButton("Increase speed"));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("shows time left at the pace and at the dial", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(
			<SpeedDetails
				model={state.model}
				dialWpm={400}
				showDial
				primary="reading"
				book={{ id: "b1", wordsLeft: 36_000 }}
				onNavigate={() => {}}
			/>,
		);
		expect(rendered.text()).toContain("Time left2h");
		expect(rendered.text()).toContain("Time left RSVP1h 40m");
	});
});
