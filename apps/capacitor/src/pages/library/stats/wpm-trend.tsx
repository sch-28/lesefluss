import { AVERAGE_READER_WPM, type SpeedWindow } from "@lesefluss/core";
import { type LineCustomSvgLayerProps, type LineSvgLayer, ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { isDarkTheme, useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import type { SpeedTrendMode } from "../../../services/db/queries/stats";
import type { TrendGranularity, TrendTestMarker } from "../../../services/stats/aggregate";
import { summariseWpmTrend } from "../../../services/stats/summaries";
import { formatShortDate, startOfLocalDay } from "../../../utils/date-utils";
import { evenTickIndices, formatDayTick } from "./chart-axis";
import { ChartTooltip } from "./chart-tooltip";
import { buildNivoTheme } from "./nivo-theme";

const COLORS = {
	rsvpTarget: "#c94b2a", // brand orange
	measured: { dark: "#94a3b8", light: "#475569" }, // slate
} as const;

const MAX_AXIS_TICKS = 5;

const NO_TESTS: TrendTestMarker[] = [];

type TrendSeries = { id: string; color: string; data: { x: number; y: number | null }[] };

function testLabel(takenAt: number, now: number): string {
	return startOfLocalDay(takenAt) === startOfLocalDay(now)
		? "Test today"
		: `Test ${formatShortDate(takenAt)}`;
}

function testMarkersLayer(tests: readonly TrendTestMarker[], now: number, color: string) {
	return function TestMarkers({
		xScale,
		yScale,
		innerHeight,
	}: LineCustomSvgLayerProps<TrendSeries>) {
		return (
			<g data-testid="wpm-trend-tests">
				{tests.map((test) => {
					const x = xScale(test.bucketIndex);
					const y = yScale(test.wpm);
					return (
						<g key={test.takenAt} data-testid="wpm-trend-test">
							<line
								x1={x}
								x2={x}
								y1={y}
								y2={innerHeight}
								stroke={color}
								strokeWidth={1}
								strokeDasharray="3 3"
								strokeOpacity={0.6}
							/>
							<rect
								x={x - 5}
								y={y - 5}
								width={10}
								height={10}
								transform={`rotate(45 ${x} ${y})`}
								fill={color}
								stroke="var(--background)"
								strokeWidth={1.5}
							/>
							<text
								x={x}
								y={y - 10}
								textAnchor="middle"
								fontSize={10}
								fill="var(--muted-foreground)"
							>
								{testLabel(test.takenAt, now)} · {test.wpm}
							</text>
						</g>
					);
				})}
			</g>
		);
	};
}

/**
 * The y-axis top, with room over the highest line: nivo draws a marker's legend
 * 14px above its line, so a marker at the very top has its label clipped.
 */
export function wpmAxisMax(values: readonly number[]): number {
	return Math.ceil((Math.max(1, ...values) * 1.2) / 50) * 50;
}

function formatBucketTick(starts: number[], granularity: TrendGranularity, index: number): string {
	const start = starts[index];
	if (start === undefined) return "";
	const d = new Date(start);
	switch (granularity) {
		case "hour":
			return `${String(d.getHours()).padStart(2, "0")}:00`;
		case "month":
			return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
		default:
			return formatDayTick(start);
	}
}

/** The x-axis legend names the window and the dates it covers, so "Last 10h" over two weeks of ticks reads right. */
export function trendAxisLegend(windowLabel: string, bucketStarts: readonly number[]): string {
	const first = bucketStarts[0];
	const last = bucketStarts.at(-1);
	if (first === undefined || last === undefined) return windowLabel;
	const from = formatShortDate(first);
	const to = formatShortDate(last);
	return from === to ? `${windowLabel} · ${from}` : `${windowLabel} · ${from} – ${to}`;
}

interface Props {
	window: SpeedWindow;
	mode: SpeedTrendMode;
	windowLabel: string;
	now: number;
}

export function WpmTrend({ window, mode, windowLabel, now }: Props) {
	const { theme, isEinkMode } = useTheme();
	const trend = queryHooks.useStatsWpmTrend(window, mode, now);
	// The palette is read from CSS variables, which e-ink mode changes without changing `theme`.
	// biome-ignore lint/correctness/useExhaustiveDependencies: isEinkMode re-reads the variables
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme, isEinkMode]);

	const points = useMemo(
		// A bucket with no sitting is a gap, not a drop to zero.
		() => (trend.data?.measured ?? []).map((p, i) => ({ x: i, y: p.avgWpm > 0 ? p.avgWpm : null })),
		[trend.data],
	);
	const hasReading = points.some((p) => p.y !== null);
	const tests = trend.data?.tests ?? NO_TESTS;
	const testColor = isDarkTheme(theme) ? "#e2e8f0" : "#0f172a";
	const layers = useMemo<LineSvgLayer<TrendSeries>[]>(
		() => [
			"grid",
			"markers",
			"axes",
			"areas",
			"crosshair",
			"lines",
			"points",
			"slices",
			testMarkersLayer(tests, now, testColor),
			"mesh",
			"legends",
		],
		[tests, now, testColor],
	);
	const lineColor = isDarkTheme(theme) ? COLORS.measured.dark : COLORS.measured.light;
	const chartData = useMemo<TrendSeries[]>(
		() => [
			{ id: mode === "rsvp" ? "RSVP speed" : "Reading speed", color: lineColor, data: points },
		],
		[lineColor, points, mode],
	);

	if (!trend.isLoading && !hasReading && tests.length === 0) {
		return (
			<p className="mb-8 px-4 text-muted-foreground text-sm">
				Not enough reading in this window for a trend.
			</p>
		);
	}

	const averages = trend.data?.averages ?? { measured: 0, rsvpTarget: 0 };
	const granularity = trend.data?.granularity ?? "week";
	const bucketStarts = (trend.data?.measured ?? []).map((p) => p.bucketStart);
	const tickIndices = evenTickIndices(bucketStarts.length, MAX_AXIS_TICKS);
	const hasRsvpTarget = averages.rsvpTarget > 0;
	const yMax = wpmAxisMax([
		AVERAGE_READER_WPM,
		averages.rsvpTarget,
		...points.map((p) => p.y ?? 0),
		...tests.map((t) => t.wpm),
	]);
	// nivo already puts role="img" on the svg; this gives it a label, so the chart
	// reads as one sentence rather than a pile of numbers.
	const chartSummary = trend.data
		? summariseWpmTrend(trend.data, windowLabel)
		: "Reading speed chart";

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-8 px-4"
		>
			{/* An empty series has no path, so nivo writes d="null" and logs
			    "Expected moveto path command" for every path, animated or not. */}
			{points.length === 0 ? (
				<div className="h-[220px]" data-testid="wpm-trend-loading" />
			) : (
				<div className="h-[220px]" role="img" aria-label={chartSummary}>
					<ResponsiveLine
						role="presentation"
						data={chartData}
						layers={layers}
						// The right margin fits half of the last date tick, which centres on the edge.
						margin={{ top: 12, right: 28, bottom: 48, left: 56 }}
						xScale={{ type: "linear" }}
						// Markers never enter the scale, so the reference lines have to be
						// folded in by hand or they render off-plot and get clipped.
						yScale={{ type: "linear", min: 0, max: yMax, stacked: false }}
						curve="monotoneX"
						enableArea={true}
						areaOpacity={0.18}
						colors={chartData.map((d) => d.color)}
						lineWidth={2.5}
						enablePoints={true}
						pointSize={5}
						pointColor={{ from: "color" }}
						pointBorderWidth={2}
						pointBorderColor={{ from: "serieColor" }}
						enableGridX={false}
						axisBottom={{
							tickSize: 0,
							tickPadding: 8,
							tickValues: tickIndices,
							format: (v) => formatBucketTick(bucketStarts, granularity, Number(v)),
							legend: trendAxisLegend(windowLabel, bucketStarts),
							legendPosition: "middle",
							legendOffset: 36,
						}}
						axisLeft={{
							tickSize: 0,
							tickPadding: 8,
							tickValues: 4,
							legend: "Words per minute",
							legendPosition: "middle",
							legendOffset: -44,
						}}
						theme={nivoTheme}
						animate={!isEinkMode}
						motionConfig="gentle"
						useMesh={true}
						tooltip={({ point }) => {
							const x = Number(point.data.x);
							const y = Number(point.data.y);
							const when = formatBucketTick(bucketStarts, granularity, x);
							return (
								<ChartTooltip>
									<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
										<span
											style={{
												display: "inline-block",
												width: 8,
												height: 8,
												borderRadius: 9999,
												backgroundColor: point.seriesColor,
											}}
										/>
										<span style={{ opacity: 0.85 }}>{point.seriesId}</span>
									</div>
									<div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
										<span style={{ fontSize: 18, fontWeight: 700 }}>{y}</span>
										<span style={{ opacity: 0.6 }}>WPM</span>
									</div>
									<div style={{ marginTop: 2, fontSize: 11, opacity: 0.6 }}>{when}</div>
								</ChartTooltip>
							);
						}}
						markers={[
							{
								axis: "y",
								value: AVERAGE_READER_WPM,
								lineStyle: {
									stroke: isDarkTheme(theme) ? "#94a3b8" : "#64748b",
									strokeWidth: 1,
									strokeDasharray: "4 4",
									strokeOpacity: 0.6,
								},
								legend: `Avg reader ${AVERAGE_READER_WPM}`,
								legendPosition: "top-left",
								textStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
							},
							...(hasRsvpTarget
								? [
										{
											axis: "y" as const,
											value: averages.rsvpTarget,
											lineStyle: {
												stroke: COLORS.rsvpTarget,
												strokeWidth: 1,
												strokeDasharray: "4 4",
												strokeOpacity: 0.7,
											},
											legend: `Avg dial ${averages.rsvpTarget}`,
											legendPosition: "top-right" as const,
											textStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
										},
									]
								: []),
						]}
					/>
				</div>
			)}
			{tests.length > 0 && (
				<p className="mt-1 text-muted-foreground text-xs">
					<span aria-hidden="true" style={{ color: testColor }}>
						◆
					</span>{" "}
					Speed test
				</p>
			)}
		</motion.section>
	);
}
