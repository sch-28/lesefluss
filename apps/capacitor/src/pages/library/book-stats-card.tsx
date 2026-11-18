import { bookPace, type MeasuredReadingMode, type Pace } from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { CARD, CARD_BODY, Card } from "@/components/card";
import { SectionHeader } from "@/components/section-header";
import { STAT_CAPTION, StatTile } from "@/components/stat-tile";
import { useTheme } from "../../contexts/theme-context";
import { useLocalDayNow } from "../../hooks/use-local-day";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { bucketSpeedSeries, type SpeedBucket } from "../../services/stats/aggregate";
import { summariseBookReading } from "../../services/stats/book-summary";
import { minuteGoalOf } from "../../services/stats/reading-goal";
import { summariseSpeedBuckets } from "../../services/stats/summaries";
import { averageDailyMinutes } from "../../services/stats/what-if";
import { formatDate, formatDuration, formatRelative, localDateKey } from "../../utils/date-utils";
import { formatPercent } from "../../utils/format-percent";
import { formatReadingTime } from "../../utils/reading-time";
import { canHaveGoal } from "./reading-goal/goal-model";
import { AnimatedNumber } from "./stats/animated-number";
import { evenTickIndices, formatDayTick } from "./stats/chart-axis";
import { ChartTooltip } from "./stats/chart-tooltip";
import { buildNivoTheme, themeColor } from "./stats/nivo-theme";
import { rsvpEstimateSpeed, WhatIfSpeed } from "./what-if-speed";

/** Ninety sittings do not fit in a 130px chart. See `bucketSpeedSeries`. */
const MAX_SPARK_POINTS = 14;

/** Enough to date the trend, few enough not to collide on a narrow card. */
const MAX_AXIS_TICKS = 3;
const GRID_LINES = MAX_AXIS_TICKS;

// Right margin fits half of the last date label: ticks are centred on their
// point, so the final one overhangs the plot and a 12px margin clipped it.
const CHART_MARGIN = { top: 10, right: 30, bottom: 26, left: 40 } as const;
const X_SCALE = { type: "linear" } as const;
const Y_SCALE = { type: "linear", min: "auto", max: "auto", stacked: false } as const;
const AXIS_LEFT = { tickSize: 0, tickPadding: 6, tickValues: MAX_AXIS_TICKS } as const;
/** Inline `{ from: "color" }` would be a new object every render, and nivo
 *  memoizes its colour generators (and the point mesh built from them) on
 *  object identity. */
const POINT_COLOR = { from: "color" } as const;

function SpeedTooltip({ bucket }: { bucket: SpeedBucket }) {
	return (
		<ChartTooltip>
			<strong>{bucket.wpm}</strong> wpm
			<div className="mt-0.5 text-2xs opacity-60">
				{bucket.sessions === 1 ? "1 sitting" : `${bucket.sessions} sittings`} ·{" "}
				{bucket.startedAt === bucket.endedAt
					? formatDate(bucket.startedAt)
					: `${formatDate(bucket.startedAt)} to ${formatDate(bucket.endedAt)}`}
			</div>
		</ChartTooltip>
	);
}

const MODE_LABELS: Record<MeasuredReadingMode, string> = {
	rsvp: "RSVP",
	scroll: "scrolling",
	page: "page turns",
};

interface Props {
	book: Book;
}

function wordsLeftOf(book: Book): number | null {
	if (book.finishedAt !== null || book.wordCount <= 0) return null;
	const left = book.wordCount - book.wordPosition;
	return left > 0 ? left : null;
}

/**
 * The what-if slider and RSVP hint of a book's reading-time card. The finish day
 * uses a minute goal's daily minutes, else the reader's recent daily average.
 */
function BookTimeAhead({ book, pace, wordsLeft }: { book: Book; pace: Pace; wordsLeft: number }) {
	const now = useLocalDayNow();
	const { data: model } = queryHooks.useStatsSpeedModel();
	const { data: settings } = queryHooks.useSettings();
	const { data: plan } = queryHooks.useReadingGoalPlan(canHaveGoal(book) ? book.id : null);
	const { data: daily } = queryHooks.useStatsDailyReading();
	const today = localDateKey(now);
	const minutesPerDay =
		(plan ? minuteGoalOf(plan.goal) : null) ??
		(daily ? averageDailyMinutes(daily.msByDay, today) : null);
	const rsvp = rsvpEstimateSpeed(model?.rsvp?.wpm ?? null, settings?.wpm ?? null);

	return (
		<WhatIfSpeed
			key={book.id}
			wordsLeft={wordsLeft}
			paceWpm={pace.wpm}
			minutesPerDay={minutesPerDay}
			today={today}
			rsvp={rsvp && rsvp.wpm > pace.wpm ? rsvp : null}
		/>
	);
}

/**
 * An unread book's length in time, at the reader's pace. A started book without
 * sittings shows no card: its time left is in the Continue button only.
 */
function BookReadingTimeCard({ book }: Props) {
	const { data: model } = queryHooks.useStatsSpeedModel();
	const wordsLeft = wordsLeftOf(book);
	if (wordsLeft === null || book.wordPosition > 0) return null;
	const pace = bookPace(model, book.id);
	const { minutesLeft, isPaceEstimated } = summariseBookReading(book, pace);

	return (
		<Card className="mt-4" title="Time to read" data-testid="book-reading-time">
			<StatTile
				size="xl"
				value={formatReadingTime(minutesLeft ?? 0)}
				label={<>Whole book{!isPaceEstimated && " · at your pace"}</>}
			/>
			<BookTimeAhead book={book} pace={pace} wordsLeft={wordsLeft} />
		</Card>
	);
}

export function BookStatsCard({ book }: Props) {
	const { theme, isEinkMode } = useTheme();
	const stats = queryHooks.useStatsBook(book.id);
	const speedModel = queryHooks.useStatsSpeedModel();
	// The palette is read from CSS variables, which e-ink mode changes without changing `theme`.
	// biome-ignore lint/correctness/useExhaustiveDependencies: isEinkMode re-reads the variables
	const { nivoTheme, lineColors } = useMemo(
		() => ({ nivoTheme: buildNivoTheme(theme), lineColors: [themeColor("--primary")] }),
		[theme, isEinkMode],
	);

	const data = stats.data;
	// Both memos sit above the early return: hooks cannot be skipped, and the
	// chart data has to keep a stable identity or nivo rebuilds its scales and
	// mesh on every parent render.
	const buckets = useMemo(
		() => bucketSpeedSeries(data?.speedSeries ?? [], MAX_SPARK_POINTS),
		[data?.speedSeries],
	);
	const chartData = useMemo(
		() => [{ id: "wpm", data: buckets.map((b, i) => ({ x: i, y: b.wpm })) }],
		[buckets],
	);
	const axisBottom = useMemo(
		() => ({
			tickSize: 0,
			tickPadding: 6,
			// Buckets are chronological, so dating the ticks is honest even though
			// x is reading order rather than a time scale.
			tickValues: evenTickIndices(buckets.length, MAX_AXIS_TICKS),
			format: (v: unknown) => {
				const bucket = buckets[Number(v)];
				return bucket ? formatDayTick(bucket.startedAt) : "";
			},
		}),
		[buckets],
	);
	const sparklineSummary = useMemo(() => summariseSpeedBuckets(buckets), [buckets]);
	const renderTooltip = useCallback(
		({ point }: { point: { data: { x: unknown } } }) => {
			const bucket = buckets[Number(point.data.x)];
			return bucket ? <SpeedTooltip bucket={bucket} /> : null;
		},
		[buckets],
	);

	if (!data || data.sessionCount === 0) return <BookReadingTimeCard book={book} />;

	const pace = bookPace(speedModel.data, book.id);
	const wordsLeft = wordsLeftOf(book);
	const { totalPages, pagesIn, percent, isFinished, minutesLeft } = summariseBookReading(
		book,
		pace,
	);
	// A reset book keeps its sittings, and its Start reading button carries no time.
	const restartMinutes = !isFinished && book.wordPosition <= 0 ? minutesLeft : null;

	const showSparkline = buckets.length >= 2;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className={cn(CARD, CARD_BODY, "mt-4")}
		>
			<SectionHeader className="mb-0" title="Your reading" />
			<div className={CARD_BODY}>
				<div className="flex items-end justify-between gap-4">
					<StatTile
						size="xl"
						value={<AnimatedNumber value={data.totalDurationMs} format={formatDuration} />}
						label="Time read"
					/>
					{restartMinutes !== null && (
						<StatTile
							size="lg"
							align="end"
							value={formatReadingTime(restartMinutes)}
							label="To read"
						/>
					)}
					{isFinished && (
						<div className="text-right">
							<div className="flex items-center justify-end gap-2 font-semibold text-success text-xl leading-none">
								<CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
								Finished
							</div>
							{book.finishedAt != null && (
								<div className={cn("mt-1", STAT_CAPTION)}>{formatRelative(book.finishedAt)}</div>
							)}
						</div>
					)}
				</div>

				{book.wordCount > 0 && (
					<div>
						<div className="h-1.5 overflow-hidden rounded-full bg-current/10">
							<motion.div
								className={`h-full rounded-full ${isFinished ? "bg-success" : "bg-primary"}`}
								initial={{ width: 0 }}
								animate={{ width: `${percent}%` }}
								transition={{ duration: 0.6, ease: "easeOut" }}
							/>
						</div>
						<p className="mt-2 text-xs tabular-nums opacity-70">
							{/* Only the page fragment is suppressed for a serial chapter;
						    how far through it the reader is still means something. */}
							{totalPages !== null && (
								<>
									Page <span className="font-semibold">{pagesIn}</span> of {totalPages} ·{" "}
								</>
							)}
							{formatPercent(percent)} read
						</p>
					</div>
				)}

				{!isFinished && wordsLeft !== null && (
					<BookTimeAhead book={book} pace={pace} wordsLeft={wordsLeft} />
				)}

				{data.measuredWpm != null && (
					<div className="border-current/10 border-t pt-3">
						<Stat
							value={<AnimatedNumber value={data.measuredWpm} />}
							label={
								data.dominantMode ? `wpm · ${MODE_LABELS[data.dominantMode]}` : "Words per minute"
							}
						/>
					</div>
				)}

				{showSparkline && (
					<div>
						<div className="h-[130px]" role="img" aria-label={sparklineSummary}>
							<ResponsiveLine
								role="presentation"
								data={chartData}
								margin={CHART_MARGIN}
								xScale={X_SCALE}
								// Not anchored at zero. Nobody reads at 12 wpm, so a zero baseline
								// spends four fifths of the height on an empty band and flattens the
								// only thing this chart is for: the shape of the change. The axis
								// is labelled, so the truncation is visible rather than implied.
								yScale={Y_SCALE}
								curve="monotoneX"
								colors={lineColors}
								lineWidth={2}
								enableArea={false}
								enablePoints={true}
								pointSize={5}
								pointColor={POINT_COLOR}
								pointBorderWidth={2}
								pointBorderColor={POINT_COLOR}
								enableGridX={false}
								enableGridY={true}
								gridYValues={GRID_LINES}
								axisBottom={axisBottom}
								axisLeft={AXIS_LEFT}
								theme={nivoTheme}
								animate={!isEinkMode}
								motionConfig="gentle"
								useMesh={true}
								tooltip={renderTooltip}
							/>
						</div>
					</div>
				)}
			</div>
		</motion.section>
	);
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
	return <StatTile value={value} label={label} valueClassName="tracking-tight" />;
}
