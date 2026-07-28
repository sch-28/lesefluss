import { BarChart3, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { queryHooks } from "../../services/db/hooks";
import { startOfLocalDay } from "../../utils/date-utils";
import { SessionTable } from "./session-table";
import { ActivityHeatmap } from "./stats/activity-heatmap";
import { EmptyState } from "./stats/empty-state";
import { Hero } from "./stats/hero";
import { PERIOD_LABELS, type Period, periodWindow } from "./stats/period";
import { PeriodTotals } from "./stats/period-totals";
import { Personality } from "./stats/personality";
import { TopBooks } from "./stats/top-books";
import { WpmTrend } from "./stats/wpm-trend";

const MS_PER_DAY = 86_400_000;

const Stats: React.FC = () => {
	// Lock "now" for the lifetime of the page so query keys derived from it
	// stay stable. Without this React Query refetches forever.
	const now = useMemo(() => Date.now(), []);
	const [period, setPeriod] = useState<Period>("7d");
	const range = useMemo(() => periodWindow(period, now), [period, now]);

	const sessionCount = queryHooks.useStatsSessionCount();

	const weekStart = useMemo(() => startOfLocalDay(now) - 6 * MS_PER_DAY, [now]);
	const weekTotals = queryHooks.useStatsPeriodTotals(weekStart, now);
	const prevWeek = queryHooks.useStatsPeriodTotals(weekStart - 7 * MS_PER_DAY, weekStart);
	const streak = queryHooks.useStatsStreak();
	// The hero's numbers are week-scoped, so its artwork has to be too.
	const heroBook = queryHooks.useStatsTopBooks(weekStart, 1);

	const hasSessions = (sessionCount.data ?? 0) > 0;
	const isInitialLoading = sessionCount.isLoading;

	const wordsThisWeek = weekTotals.data?.words ?? 0;
	const prevWords = prevWeek.data?.words;
	const deltaVsPrev =
		prevWords && prevWords > 0 ? ((wordsThisWeek - prevWords) / prevWords) * 100 : null;
	const topCover = heroBook.data?.[0]?.coverImage ?? null;
	const topBookId = heroBook.data?.[0]?.bookId ?? null;
	const currentStreak = streak.data?.current ?? 0;

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
						wordsThisWeek={wordsThisWeek}
						currentStreak={currentStreak}
						topCover={topCover}
						topBookId={topBookId}
						deltaVsPrev={deltaVsPrev}
					/>
					<PeriodTotals now={now} period={period} range={range} onPeriodChange={setPeriod} />
					<TopBooks since={range.start} periodLabel={PERIOD_LABELS[period]} />
					<ActivityHeatmap />
					<WpmTrend />
					<Personality />
					<SessionTable mode="global" />
					<p className="px-4 pb-6 text-[11px] text-muted-foreground">
						Reading on a connected device isn't counted here; only sessions in the app are tracked.
					</p>
				</>
			)}
		</div>
	);
};

export default Stats;
