import type { SpeedModel } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../../test/render";

const pending = { data: undefined, isPending: true, isLoading: true };

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouter: () => ({ history: { push: vi.fn() } }),
}));
vi.mock("../../../../hooks/use-continue-reading", () => ({ useContinueReading: () => null }));
vi.mock("../../book-actions/use-book-actions", () => ({
	useBookActions: () => ({ open: vi.fn(), overlays: null }),
}));
vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: new Proxy({}, { get: () => () => pending }),
}));

const { RecordsCard } = await import("../records-card");
const { CurrentlyReading } = await import("../currently-reading");
const { FinishedShelf } = await import("../finished-shelf");
const { TodayGoalCard } = await import("../today-goal-card");
const { PeriodTotals } = await import("../period-totals");
const { Activity } = await import("../activity");
const { AnimatedNumber } = await import("../animated-number");
const { MilestonesSection } = await import("../speed-tab/milestones-section");
const { PersonalBests, SpeedInsights } = await import("../speed-tab/speed-insights");
const { BookSpeedList } = await import("../speed-tab/book-speed-list");

const model = {
	window: "recent",
	reading: { wpm: 250, source: "measured", activeMs: 3_600_000 },
	rsvp: null,
} as unknown as SpeedModel;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const reservedHeights = (v: Rendered) =>
	[...v.container.querySelectorAll<HTMLElement>('[data-testid="reserved-card"]')].map(
		(el) => el.style.height,
	);

describe("Stats cards while their query loads", () => {
	it.each([
		["Records", <RecordsCard key="r" />, "170px"],
		["Currently reading", <CurrentlyReading key="c" />, "98px"],
		["Finished", <FinishedShelf key="f" />, "253px"],
		["Milestones", <MilestonesSection key="m" />, "261px"],
		["Insights", <SpeedInsights key="i" model={model} view="reading" />, "224px"],
		["RSVP insights", <SpeedInsights key="ir" model={model} view="rsvp" />, "280px"],
		["Personal bests", <PersonalBests key="s" />, "114px"],
		["Books", <BookSpeedList key="b" model={model} />, "260px"],
	])("%s holds its loaded height instead of rendering nothing", async (_name, card, height) => {
		view = await render(card);
		expect(reservedHeights(view)).toEqual([height]);
	});

	it("keeps the section titles in place while the rows load", async () => {
		view = await render(
			<>
				<RecordsCard />
				<CurrentlyReading />
				<FinishedShelf />
			</>,
		);
		expect(view.text()).toContain("Records");
		expect(view.text()).toContain("Currently reading");
		expect(view.text()).toContain("Finished");
	});

	it("heads Totals, Records and Personal bests with the one section header, above the card", async () => {
		view = await render(
			<>
				<PeriodTotals
					now={Date.now()}
					period="7d"
					range={{ start: 0, prevStart: 0, prevEnd: 0 }}
					onPeriodChange={vi.fn()}
				/>
				<RecordsCard />
				<PersonalBests />
			</>,
		);
		const headed = [...view.container.querySelectorAll("section > header:first-child > h2")];
		expect(headed.map((h) => h.textContent)).toEqual(["Totals", "Records", "Personal bests"]);
		expect(view.container.querySelectorAll("h2")).toHaveLength(3);
	});

	it("never shows a 0 total before the totals land", async () => {
		view = await render(
			<PeriodTotals
				now={Date.now()}
				period="7d"
				range={{ start: 0, prevStart: 0, prevEnd: 0 }}
				onPeriodChange={vi.fn()}
			/>,
		);
		expect(view.container.querySelector(".grid")?.textContent).not.toMatch(/\d/);
		expect(view.container.querySelectorAll('[aria-label="Loading"]')).toHaveLength(3);
	});

	it("keeps the goal card and its week row while goal and streak load, the text hidden", async () => {
		view = await render(<TodayGoalCard />);
		const card = view.getButton("Reading goals");
		expect(card.disabled).toBe(true);
		expect(card.querySelector(".invisible")).not.toBeNull();
		expect(view.container.querySelector('[data-testid="streak-week"]')).not.toBeNull();
	});

	it("draws the reading-hours axes with no bars while the days load", async () => {
		view = await render(<Activity />);
		const chart = view.container.querySelector('[data-testid="stats-reading-hours"] svg');
		expect(chart?.querySelectorAll("line")).toHaveLength(4);
		expect(chart?.querySelectorAll("rect")).toHaveLength(0);
	});

	it("shows a total's final value from its first render, without counting up from 0", async () => {
		view = await render(<AnimatedNumber value={5263} format={(v) => `${Math.round(v)} min`} />);
		expect(view.text()).toBe("5263 min");
	});
});
