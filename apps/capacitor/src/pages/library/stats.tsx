import { Tabs, TabsList, TabsTrigger } from "@lesefluss/ui/tabs";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BarChart3, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TabHeader } from "../../components/app-shell/tab-header";
import { useLocalDayNow } from "../../hooks/use-local-day";
import { queryHooks } from "../../services/db/hooks";
import { Activity } from "./stats/activity";
import { CurrentlyReading } from "./stats/currently-reading";
import { EmptyState } from "./stats/empty-state";
import { FinishedShelf } from "./stats/finished-shelf";
import { PERIOD_LABELS, type Period, periodWindow } from "./stats/period";
import { PeriodTotals } from "./stats/period-totals";
import { RecordsCard } from "./stats/records-card";
import { SessionsTab } from "./stats/sessions-tab";
import { SpeedTab } from "./stats/speed-tab/speed-tab";
import { isStatsTab, STATS_TAB_LABELS, STATS_TABS, type StatsSearch } from "./stats/stats-search";
import { TodayGoalCard } from "./stats/today-goal-card";
import { TopBooks } from "./stats/top-books";

const Stats: React.FC = () => {
	// Locked rather than live: query keys derive from it, and a ticking value
	// would refetch forever. Rolled forward on the next visibility change if the
	// local day moved on, so a backgrounded page stops reporting yesterday.
	const now = useLocalDayNow();
	// All time is the honest landing state for a habit: a reader three days in
	// sees an empty page under any shorter default.
	const [period, setPeriod] = useState<Period>("all");
	const range = useMemo(() => periodWindow(period, now), [period, now]);

	const search = useSearch({ from: "/tabs/stats" });
	const navigate = useNavigate();
	const tab = search.tab ?? "overview";
	const setSearch = (next: StatsSearch) =>
		navigate({ to: "/tabs/stats", search: next, replace: true });

	const sessionCount = queryHooks.useReadingSessionCount();

	const hasSessions = (sessionCount.data ?? 0) > 0;
	const isInitialLoading = sessionCount.isLoading;

	return (
		<div className="bg-background text-foreground">
			<TabHeader title="Stats" icon={BarChart3} />
			<div className="mx-auto w-full max-w-3xl">
				{isInitialLoading ? (
					<div className="flex min-h-[60vh] items-center justify-center">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<>
						<Tabs
							value={tab}
							onValueChange={(v) => {
								if (isStatsTab(v)) setSearch(v === "overview" ? {} : { tab: v });
							}}
							className="sticky top-[calc(var(--safe-top)+3rem+1px)] z-10 bg-background px-4 py-2"
						>
							{/* Wraps: at a large system font the three labels are wider than a phone. */}
							<TabsList className="min-h-11 w-full flex-wrap group-data-[orientation=horizontal]/tabs:h-auto">
								{STATS_TABS.map((t) => (
									<TabsTrigger key={t} value={t} className="min-h-[calc(2.75rem-7px)]">
										{STATS_TAB_LABELS[t]}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
						{tab === "sessions" ? (
							<SessionsTab
								now={now}
								bookId={search.book}
								onBookChange={(book) => setSearch({ tab: "sessions", book })}
							/>
						) : tab === "speed" ? (
							<SpeedTab now={now} />
						) : !hasSessions ? (
							<EmptyState />
						) : (
							<div className="pt-2">
								<TodayGoalCard />

								<PeriodTotals now={now} period={period} range={range} onPeriodChange={setPeriod} />

								{/* At all time this is the finished shelf re-sorted: on real data the
							   top five by time read were the same five books. It only says
							   something new when scoped to a window, where it also surfaces
							   books still in progress. */}
								{period !== "all" && (
									<TopBooks since={range.start} periodLabel={PERIOD_LABELS[period]} />
								)}

								<Activity />

								<CurrentlyReading />

								<RecordsCard />

								<FinishedShelf />

								<p className="px-4 py-6 text-muted-foreground text-xs">
									Only reading in this app is tracked. Time spent on a book you uploaded to a device
									isn't counted here.
								</p>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
};

export default Stats;
