import { BarChart3, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { queryHooks } from "../../services/db/hooks";
import { startOfLocalDay } from "../../utils/date-utils";
import { SessionTable } from "./session-table";
import { ActivityHeatmap } from "./stats/activity-heatmap";
import { EmptyState } from "./stats/empty-state";
import { Hero } from "./stats/hero";
import { PeriodTotals } from "./stats/period-totals";
import { Personality } from "./stats/personality";
import { TopBooks } from "./stats/top-books";
import { WpmTrend } from "./stats/wpm-trend";

const MS_PER_DAY = 86_400_000;

const Stats: React.FC = () => {
	// Lock "now" for the lifetime of the page so query keys derived from it
	// stay stable. Without this React Query refetches forever.
	const now = useMemo(() => Date.now(), []);

	const sessionCount = queryHooks.useStatsSessionCount();

	const weekWindow = useMemo(() => {
		const start = startOfLocalDay(now) - 6 * MS_PER_DAY;
		return { start, prevStart: start - 7 * MS_PER_DAY, prevEnd: start };
	}, [now]);
	const weekTotals = queryHooks.useStatsPeriodTotals(weekWindow.start, now);
	const prevWeek = queryHooks.useStatsPeriodTotals(weekWindow.prevStart, weekWindow.prevEnd);
	const streak = queryHooks.useStatsStreak();
	const top = queryHooks.useStatsTopBooks(weekWindow.start, 1);

	const hasSessions = (sessionCount.data ?? 0) > 0;
	const isInitialLoading = sessionCount.isLoading;

	const wordsThisWeek = weekTotals.data?.words ?? 0;
	const prevWords = prevWeek.data?.words;
	const deltaVsPrev =
		prevWords && prevWords > 0 ? ((wordsThisWeek - prevWords) / prevWords) * 100 : null;
	const topCover = top.data?.[0]?.coverImage ?? null;
	const topBookId = top.data?.[0]?.bookId ?? null;
	const currentStreak = streak.data?.current ?? 0;

	return (
		<div className="min-h-screen bg-background text-foreground">
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
					<PeriodTotals now={now} />
					<ActivityHeatmap />
					<TopBooks now={now} />
					<WpmTrend />
					<Personality />
					<SessionTable mode="global" />
				</>
			)}
		</div>
	);
};

export default Stats;
