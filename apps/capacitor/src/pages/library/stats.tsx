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
	const [period, setPeriod] = useState<Period>("7d");
	const range = useMemo(() => periodWindow(period, now), [period, now]);

	const sessionCount = queryHooks.useReadingSessionCount();

	const streak = queryHooks.useStatsStreak();
	// Same key as TopBooks, so the two share one query.
	const topBooks = queryHooks.useStatsTopBooks(range.start, 5);

	const hasSessions = (sessionCount.data ?? 0) > 0;
	const isInitialLoading = sessionCount.isLoading;

	const topCover = topBooks.data?.[0]?.coverImage ?? null;
	const topBookId = topBooks.data?.[0]?.workId ?? null;
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
					<Hero
						currentStreak={currentStreak}
						longestStreak={longestStreak}
						topCover={topCover}
						topBookId={topBookId}
					/>
					<Activity />

					{/* Period control sits with the sections it drives. */}
					<PeriodTotals now={now} period={period} range={range} onPeriodChange={setPeriod} />
					<TopBooks since={range.start} periodLabel={PERIOD_LABELS[period]} />

					<WpmTrend period={period} periodLabel={PERIOD_LABELS[period]} now={now} />

					<div className="px-4">
						<SessionTable mode="global" />
					</div>
					<p className="px-4 pb-6 text-[11px] text-muted-foreground">
						Reading on a connected device isn't counted here; only sessions in the app are tracked.
					</p>
				</>
			)}
		</div>
	);
};

export default Stats;
