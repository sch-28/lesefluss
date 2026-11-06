import type { SpeedModel } from "@lesefluss/core";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { chipParts, modeMix } from "../speed-chip-model";

const mutate = vi.fn();
const state: {
	model: SpeedModel | undefined;
	settings: { wpm: number; defaultReaderMode: string };
} = {
	model: undefined,
	settings: { wpm: 400, defaultReaderMode: "scroll" },
};

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: state.model }),
		useSettings: () => ({ data: state.settings }),
		useSaveSettings: () => ({ mutate }),
	},
}));
vi.mock("../../../hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		onClick,
	}: {
		children: React.ReactNode;
		to: string;
		onClick?: () => void;
	}) => (
		<a href={to} onClick={onClick}>
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
		expect(chipText(rendered)).toBe("260 wpm");

		await click(rendered.getButton(/260/));
		expect(details()?.textContent).toContain("Reading");
		expect(details()?.textContent).not.toContain("RSVP");
	});

	it("orders both speeds by the default reader mode", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(<SpeedChip />);
		expect(chipText(rendered)).toBe("260 wpm·RSVP 420");
		rendered.unmount();

		state.settings = { wpm: 400, defaultReaderMode: "rsvp" };
		rendered = await render(<SpeedChip />);
		expect(chipText(rendered)).toBe("RSVP 420 wpm·Reading 260");
	});

	it("opens the details with both tiles, the mix and the Speed tab link", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(<SpeedChip />);
		await click(rendered.getButton(/260/));
		const text = (details()?.textContent ?? "").replace(/\s+/g, " ");
		expect(text).toContain("Reading260 wpm");
		expect(text).toContain("RSVP420 wpm");
		expect(text).toContain("Dial 450");
		expect(text).toContain("Reading 61% · RSVP 39%");
		expect(document.querySelector("a[href='/tabs/library/stats']")?.textContent).toContain(
			"Open Speed tab",
		);
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
				book={{ id: "b1", wordsLeft: 36_000 }}
				onNavigate={() => {}}
			/>,
		);
		const dial = () => rendered?.container.querySelector("[data-testid=speed-dial]")?.textContent;
		expect(rendered.text()).toContain("RSVP at dial360 wpm");

		await click(rendered.getButton("Dial +25"));
		await click(rendered.getButton("Dial +25"));
		expect(dial()).toBe("450");
		expect(mutate.mock.calls).toEqual([[{ wpm: 425 }], [{ wpm: 450 }]]);
		expect(rendered.text()).toContain("RSVP at dial405 wpm");

		await click(rendered.getButton("Dial −25"));
		expect(mutate).toHaveBeenLastCalledWith({ wpm: 425 });
	});

	it("stops at the dial's limits without saving", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(
			<SpeedDetails model={state.model} dialWpm={1000} showDial onNavigate={() => {}} />,
		);
		expect(rendered.getButton("Dial +25").disabled).toBe(true);
		await click(rendered.getButton("Dial +25"));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("shows time left at the pace and at the dial", async () => {
		state.model = model({ rsvp: true });
		rendered = await render(
			<SpeedDetails
				model={state.model}
				dialWpm={400}
				showDial
				book={{ id: "b1", wordsLeft: 36_000 }}
				onNavigate={() => {}}
			/>,
		);
		expect(rendered.text()).toContain("Time left2h");
		expect(rendered.text()).toContain("Time left RSVP1h 40m");
	});
});
