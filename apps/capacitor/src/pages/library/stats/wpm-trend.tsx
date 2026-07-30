import { ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import type { TrendGranularity, TrendPeriod } from "../../../services/stats/aggregate";
import { summariseWpmTrend } from "../../../services/stats/summaries";
import { AVERAGE_READER_WPM } from "../../../utils/reading-time";
import { evenTickIndices, formatDayTick } from "./chart-axis";
import { ChartTooltip } from "./chart-tooltip";
import { buildNivoTheme } from "./nivo-theme";

const COLORS = {
	rsvpTarget: "#c94b2a", // brand orange
	measured: { dark: "#94a3b8", light: "#475569" }, // slate
} as const;

const MAX_AXIS_TICKS = 5;

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

interface Props {
	period: TrendPeriod;
	periodLabel: string;
	now: number;
}

export function WpmTrend({ period, periodLabel, now }: Props) {
	const { theme } = useTheme();
	const trend = queryHooks.useStatsWpmTrend(period, now);
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);

	const points = useMemo(
		() => (trend.data?.measured ?? []).map((p, i) => ({ x: i, y: p.avgWpm })),
		[trend.data],
	);
	const hasReading = points.some((p) => p.y > 0);
	const lineColor = theme === "dark" ? COLORS.measured.dark : COLORS.measured.light;
	const chartData = useMemo(
		() => [{ id: "Reading speed", color: lineColor, data: points }],
		[lineColor, points],
	);

	if (!trend.isLoading && !hasReading) {
		return (
			<motion.section
				initial={{ opacity: 0, y: 12 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.25 }}
				transition={{ duration: 0.5 }}
				className="mb-10 px-4"
			>
				<header className="mb-3">
					<h2 className="font-semibold text-lg">Reading speed</h2>
				</header>
				<div className="rounded-xl border border-current/15 border-dashed p-6 text-center text-sm opacity-70">
					Read in any mode to see your speed trend.
				</div>
			</motion.section>
		);
	}

	const averages = trend.data?.averages ?? { measured: 0, rsvpTarget: 0 };
	const granularity = trend.data?.granularity ?? "week";
	const bucketStarts = (trend.data?.measured ?? []).map((p) => p.bucketStart);
	const tickIndices = evenTickIndices(bucketStarts.length, MAX_AXIS_TICKS);
	const hasRsvpTarget = averages.rsvpTarget > 0;
	const yMax = Math.max(AVERAGE_READER_WPM, averages.rsvpTarget, ...points.map((point) => point.y));
	// nivo already puts role="img" on the svg; this gives it a label, so the chart
	// reads as one sentence rather than a pile of numbers.
	const chartSummary = trend.data
		? summariseWpmTrend(trend.data, periodLabel)
		: "Reading speed chart";

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-10 px-4"
		>
			<header className="mb-3 flex items-end justify-between">
				<div>
					<h2 className="font-semibold text-lg">Reading speed</h2>
					<p className="mt-0.5 text-[11px] uppercase tracking-wider opacity-60">
						{periodLabel} · words per minute
					</p>
				</div>
				<div className="text-right">
					<div className="font-bold text-3xl tabular-nums leading-none tracking-tight">
						{averages.measured}
					</div>
					<div className="mt-1 text-[11px] uppercase tracking-wider opacity-60">
						words per minute
					</div>
					{hasRsvpTarget && (
						<div className="mt-0.5 text-[11px] opacity-60">RSVP set to {averages.rsvpTarget}</div>
					)}
				</div>
			</header>

			<div className="h-[220px]" role="img" aria-label={chartSummary}>
				<ResponsiveLine
					role="presentation"
					data={chartData}
					margin={{ top: 12, right: 12, bottom: 48, left: 56 }}
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
						legend: periodLabel,
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
					animate={true}
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
								stroke: theme === "dark" ? "#94a3b8" : "#64748b",
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
										legend: `Target ${averages.rsvpTarget}`,
										legendPosition: "top-right" as const,
										textStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
									},
								]
							: []),
					]}
				/>
			</div>
		</motion.section>
	);
}
