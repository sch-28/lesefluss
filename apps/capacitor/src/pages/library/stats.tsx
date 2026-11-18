import { Tabs, TabsList, TabsTrigger } from "@lesefluss/ui/tabs";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { EMPTY_STATE_PAGE } from "@/components/empty-state";
import { PageBody, PageToolbar, TOOLBAR_ROW } from "@/components/page-body";
import { PageContainer } from "@/components/page-container";
import { TabHeader } from "../../components/app-shell/tab-header";
import { ReservedCard } from "../../components/reserved-card";
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
			<TabHeader width="text" title="Stats" icon={BarChart3} />
			<PageToolbar sticky className="bg-background">
				<PageContainer width="text" className={cn("px-4", TOOLBAR_ROW)}>
					<Tabs
						value={tab}
						onValueChange={(v) => {
							if (isStatsTab(v)) setSearch(v === "overview" ? {} : { tab: v });
						}}
						className="@container"
					>
						{/* Stacks where the three labels no longer fit one row (large system text):
					    one tab a row reads better than a 2+1 wrap. */}
						<TabsList className="min-h-11 w-full @max-[13.5em]:flex-col @max-[13.5em]:items-stretch group-data-[orientation=horizontal]/tabs:h-auto">
							{STATS_TABS.map((t) => (
								<TabsTrigger key={t} value={t} className="min-h-[calc(2.75rem-7px)]">
									{STATS_TAB_LABELS[t]}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</PageContainer>
			</PageToolbar>
			<PageBody width="text" belowToolbar className="px-0">
				{tab === "sessions" ? (
					<SessionsTab
						now={now}
						bookId={search.book}
						onBookChange={(book) => setSearch({ tab: "sessions", book })}
					/>
				) : tab === "speed" ? (
					<SpeedTab now={now} />
				) : isInitialLoading ? (
					<ReservedCard isPending height="60vh" />
				) : !hasSessions ? (
					// The goal card sits above the empty state, so the pair takes the page's free
					// height and the empty state centres in what the card leaves.
					<div className={cn("flex flex-col", EMPTY_STATE_PAGE)}>
						<TodayGoalCard />
						<EmptyState page={false} className="flex-1 pb-20" />
					</div>
				) : (
					<div>
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

						<p className="px-4 pt-6 text-muted-foreground text-xs">
							Only reading in this app is tracked. Time spent on a book you uploaded to a device
							isn't counted here.
						</p>
					</div>
				)}
			</PageBody>
		</div>
	);
};

export default Stats;
