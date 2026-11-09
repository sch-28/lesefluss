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
const { Hero } = await import("../hero");
const { AnimatedNumber } = await import("../animated-number");
const { MilestonesSection } = await import("../speed-tab/milestones-section");
const { ReadingInsights, ReadingRecords } = await import("../speed-tab/speed-insights");

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
		["Records", <RecordsCard key="r" />, "181px"],
		["Currently reading", <CurrentlyReading key="c" />, "98px"],
		["Finished", <FinishedShelf key="f" />, "253px"],
		["Today's goal", <TodayGoalCard key="t" streak={0} />, "78px"],
		["Milestones", <MilestonesSection key="m" />, "283px"],
		["Reading insights", <ReadingInsights key="i" />, "78px"],
		["Speed records", <ReadingRecords key="s" />, "130px"],
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

	it("hides the streak figures until the streak lands, keeping the hero's box", async () => {
		view = await render(<Hero isPending currentStreak={0} longestStreak={0} freezesBanked={0} />);
		const figure = view.container.querySelector(".text-5xl")?.parentElement;
		expect(figure?.className).toContain("invisible");
	});

	it("shows the streak at its final value once it lands, without counting up from 0", async () => {
		view = await render(<Hero isPending currentStreak={0} longestStreak={0} freezesBanked={0} />);
		await view.rerender(
			<Hero isPending={false} currentStreak={12} longestStreak={20} freezesBanked={0} />,
		);
		expect(view.container.querySelector(".text-5xl")?.textContent).toBe("12");
	});

	it("shows a total's final value from its first render, without counting up from 0", async () => {
		view = await render(<AnimatedNumber value={5263} format={(v) => `${Math.round(v)} min`} />);
		expect(view.text()).toBe("5263 min");
	});
});
