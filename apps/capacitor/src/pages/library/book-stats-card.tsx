import { ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTheme } from "../../contexts/theme-context";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { bucketSpeedSeries, type SpeedBucket } from "../../services/stats/aggregate";
import { summariseBookReading } from "../../services/stats/book-summary";
import { formatDuration, formatRelative } from "../../utils/date-utils";
import { formatReadingTime } from "../../utils/reading-time";

import { AnimatedNumber } from "./stats/animated-number";
import { evenTickIndices, formatDayTick } from "./stats/chart-axis";
import { ChartTooltip } from "./stats/chart-tooltip";
import { buildNivoTheme } from "./stats/nivo-theme";

const LINE_COLOR = "#c94b2a";
const LINE_COLORS = [LINE_COLOR];

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
			<div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
				{bucket.sessions === 1 ? "1 sitting" : `${bucket.sessions} sittings`} ·{" "}
				{bucket.startedAt === bucket.endedAt
					? formatDayTick(bucket.startedAt)
					: `${formatDayTick(bucket.startedAt)} to ${formatDayTick(bucket.endedAt)}`}
			</div>
		</ChartTooltip>
	);
}

const MODE_LABELS: Record<"rsvp" | "scroll" | "page", string> = {
	rsvp: "RSVP",
	scroll: "scrolling",
	page: "page turns",
};

interface Props {
	book: Book;
}

export function BookStatsCard({ book }: Props) {
	const { theme } = useTheme();
	const stats = queryHooks.useStatsBook(book.id);
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);

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
	const renderTooltip = useCallback(
		({ point }: { point: { data: { x: unknown } } }) => {
			const bucket = buckets[Number(point.data.x)];
			return bucket ? <SpeedTooltip bucket={bucket} /> : null;
		},
		[buckets],
	);

	if (!data || data.sessionCount === 0) return null;

	const { totalPages, pagesIn, percent, isFinished, isPaceEstimated, minutesLeft } =
		summariseBookReading(book, data.measuredWpm);

	const showSparkline = buckets.length >= 2;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="book-detail-card mt-4"
		>
			<h2 className="book-detail-section-title">Your reading</h2>

			<div className="mt-3 flex items-end justify-between gap-4">
				<div>
					<div className="font-bold text-4xl tabular-nums leading-none tracking-tight">
						{data.measuredWpm != null ? <AnimatedNumber value={data.measuredWpm} /> : "—"}
					</div>
					<div className="mt-1.5 text-[11px] uppercase tracking-wider opacity-60">
						words per minute
						{data.dominantMode && ` · mostly ${MODE_LABELS[data.dominantMode]}`}
					</div>
				</div>
				{isFinished ? (
					<div className="text-right">
						<div className="flex items-center justify-end gap-1.5 font-semibold text-emerald-500 text-xl leading-none">
							<CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
							Finished
						</div>
						{book.finishedAt != null && (
							<div className="mt-1.5 text-[11px] uppercase tracking-wider opacity-60">
								{formatRelative(book.finishedAt)}
							</div>
						)}
					</div>
				) : (
					minutesLeft != null &&
					minutesLeft > 0 && (
						<div className="text-right">
							<div className="font-semibold text-xl tabular-nums leading-none">
								{formatReadingTime(minutesLeft)}
							</div>
							<div className="mt-1.5 text-[11px] uppercase tracking-wider opacity-60">
								left{isPaceEstimated ? " · estimated" : " · at your pace"}
							</div>
						</div>
					)
				)}
			</div>

			{book.wordCount > 0 && (
				<div className="mt-4">
					<div className="h-1.5 overflow-hidden rounded-full bg-current/10">
						<motion.div
							className={`h-full rounded-full ${isFinished ? "bg-emerald-500" : "bg-current/50"}`}
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
						{percent}% read
					</p>
				</div>
			)}

			<div className="mt-4 grid grid-cols-3 gap-3 border-current/10 border-t pt-3">
				<Stat
					value={<AnimatedNumber value={data.totalDurationMs} format={formatDuration} />}
					label="Time read"
				/>
				<Stat
					value={<AnimatedNumber value={data.sessionCount} />}
					label={data.sessionCount === 1 ? "Sitting" : "Sittings"}
				/>
				<Stat
					value={<span>{formatRelative(data.lastReadAt ?? Date.now())}</span>}
					label="Last read"
				/>
			</div>

			{showSparkline && (
				<div className="mt-4">
					<div className="h-[130px]">
						<ResponsiveLine
							data={chartData}
							margin={CHART_MARGIN}
							xScale={X_SCALE}
							// Not anchored at zero. Nobody reads at 12 wpm, so a zero baseline
							// spends four fifths of the height on an empty band and flattens the
							// only thing this chart is for: the shape of the change. The axis
							// is labelled, so the truncation is visible rather than implied.
							yScale={Y_SCALE}
							curve="monotoneX"
							colors={LINE_COLORS}
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
							animate={true}
							motionConfig="gentle"
							useMesh={true}
							tooltip={renderTooltip}
						/>
					</div>
				</div>
			)}
		</motion.section>
	);
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
	return (
		<div>
			<div className="font-semibold text-lg tabular-nums tracking-tight">{value}</div>
			<div className="mt-0.5 text-[10px] uppercase tracking-wider opacity-60">{label}</div>
		</div>
	);
}
