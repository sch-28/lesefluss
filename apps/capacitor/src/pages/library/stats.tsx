import { BarChart3, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { queryHooks } from "../../services/db/hooks";
import { startOfLocalDay } from "../../utils/date-utils";
import { SessionTable } from "./session-table";
import { Activity } from "./stats/activity";
import { EmptyState } from "./stats/empty-state";
import { Hero } from "./stats/hero";
import { PERIOD_LABELS, type Period, periodWindow } from "./stats/period";
import { PeriodTotals } from "./stats/period-totals";
import { RecordsCard } from "./stats/records-card";
import { CurrentlyReadingShelf } from "./stats/currently-reading-shelf";
import { FinishedShelf } from "./stats/finished-shelf";
import { TopBooks } from "./stats/top-books";
import { WpmTrend } from "./stats/wpm-trend";

const Stats: React.FC = () => {
	// Locked rather than live: query keys derive from it, and a ticking value
	// would refetch forever. Rolled forward on the next visibility change if the
	// local day moved on, so a backgrounded page stops reporting yesterday.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === "hidden") return;
			setNow((current) =>
				startOfLocalDay(current) === startOfLocalDay(Date.now()) ? current : Date.now(),
			);
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, []);
	// All time is the honest landing state for a habit: a reader three days in
	// sees an empty page under any shorter default.
	const [period, setPeriod] = useState<Period>("all");
	const range = useMemo(() => periodWindow(period, now), [period, now]);

	const sessionCount = queryHooks.useReadingSessionCount();

	const streak = queryHooks.useStatsStreak();

	const hasSessions = (sessionCount.data ?? 0) > 0;
	const isInitialLoading = sessionCount.isLoading;

	const currentStreak = streak.data?.current ?? 0;
	const longestStreak = streak.data?.longest ?? 0;

	return (
		<div className="bg-background text-foreground">
			<PageHeader title="Reading stats" icon={BarChart3} />
			{isInitialLoading ? (
				<div className="flex min-h-[60vh] items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : !hasSessions ? (
				<EmptyState />
			) : (
				<>
					<Hero currentStreak={currentStreak} longestStreak={longestStreak} />

					{/* Period control sits with the sections it drives. */}
					<PeriodTotals now={now} period={period} range={range} onPeriodChange={setPeriod} />

					<CurrentlyReadingShelf />
					<FinishedShelf />

					{/* At all time this is the finished shelf re-sorted: on real data the
					    top five by time read were the same five books. It only says
					    something new when scoped to a window, where it also surfaces
					    books still in progress. */}
					{period !== "all" && (
						<TopBooks since={range.start} periodLabel={PERIOD_LABELS[period]} />
					)}

					<WpmTrend period={period} periodLabel={PERIOD_LABELS[period]} now={now} />

					{/* Always all-time, so these sit below the sections the period tabs drive. */}
					<Activity />
					<RecordsCard />

					<div className="px-4">
						<SessionTable mode="global" />
					</div>
					<p className="mt-4 px-4 pb-6 text-[11px] text-muted-foreground">
						Only reading in this app is tracked. Time spent on a book you uploaded to a device
						isn't counted here.
					</p>
				</>
			)}
		</div>
	);
};

export default Stats;
