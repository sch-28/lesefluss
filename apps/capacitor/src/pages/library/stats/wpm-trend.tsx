import { ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import type { TrendGranularity, TrendPeriod } from "../../../services/stats/aggregate";
import { buildNivoTheme } from "./nivo-theme";

const COLORS = {
	rsvpTarget: "#c94b2a", // brand orange
	rsvpDelivered: "#f4a261", // soft sand
	read: { dark: "#94a3b8", light: "#475569" }, // slate
} as const;

const AVG_READER_WPM = 225;

const MAX_AXIS_TICKS = 5;

function evenTickIndices(count: number): number[] {
	if (count <= MAX_AXIS_TICKS) return Array.from({ length: count }, (_, i) => i);
	const step = (count - 1) / (MAX_AXIS_TICKS - 1);
	return Array.from({ length: MAX_AXIS_TICKS }, (_, i) => Math.round(i * step));
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
			return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}
}

type SeriesId = "rsvpTarget" | "rsvpDelivered" | "read";

const LABELS: Record<SeriesId, string> = {
	rsvpTarget: "RSVP target",
	rsvpDelivered: "RSVP delivered",
	read: "Reading speed",
};

interface Props {
	period: TrendPeriod;
	periodLabel: string;
	now: number;
}

export function WpmTrend({ period, periodLabel, now }: Props) {
	const { theme } = useTheme();
	const trend = queryHooks.useStatsWpmTrend(period, now);
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);

	const colors: Record<SeriesId, string> = useMemo(
		() => ({
			rsvpTarget: COLORS.rsvpTarget,
			rsvpDelivered: COLORS.rsvpDelivered,
			read: theme === "dark" ? COLORS.read.dark : COLORS.read.light,
		}),
		[theme],
	);

	const seriesData: Record<SeriesId, Array<{ x: number; y: number }>> = useMemo(
		() => ({
			rsvpTarget: (trend.data?.rsvpTarget ?? []).map((p, i) => ({ x: i, y: p.avgWpm })),
			rsvpDelivered: (trend.data?.rsvpDelivered ?? []).map((p, i) => ({ x: i, y: p.avgWpm })),
			read: (trend.data?.read ?? []).map((p, i) => ({ x: i, y: p.avgWpm })),
		}),
		[trend.data],
	);

	const present: SeriesId[] = useMemo(
		() =>
			(["rsvpTarget", "rsvpDelivered", "read"] as const).filter((id) =>
				seriesData[id].some((p) => p.y > 0),
			),
		[seriesData],
	);

	const chartData = useMemo(
		() =>
			present.map((id) => ({
				id: LABELS[id],
				color: colors[id],
				data: seriesData[id],
			})),
		[present, colors, seriesData],
	);

	if (!trend.isLoading && present.length === 0) {
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

	// Measurements first. The dial setting is an input, not a reading speed, and
	// headlining it told RSVP users their own slider position.
	const averages = trend.data?.averages ?? { rsvpTarget: 0, rsvpDelivered: 0, read: 0 };
	const granularity = trend.data?.granularity ?? "week";
	const bucketStarts = (trend.data?.read ?? []).map((p) => p.bucketStart);
	const tickIndices = evenTickIndices(bucketStarts.length);
	const headlineId: SeriesId | null =
		(["rsvpDelivered", "read", "rsvpTarget"] as const).find((id) => present.includes(id)) ?? null;
	const headlineAvg = headlineId ? averages[headlineId] : 0;
	const headlineLabel = headlineId ? LABELS[headlineId] : "";
	const hasRsvpTarget = headlineId === "rsvpDelivered" && averages.rsvpTarget > 0;

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
						{headlineAvg}
					</div>
					<div className="mt-1 text-[11px] uppercase tracking-wider opacity-60">
						{headlineLabel}
					</div>
					{hasRsvpTarget && (
						<div className="mt-0.5 text-[11px] opacity-60">at a {averages.rsvpTarget} target</div>
					)}
				</div>
			</header>

			<div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
				{present.map((id) => (
					<span key={id} className="flex items-center gap-1.5">
						<span
							className="inline-block h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: colors[id] }}
						/>
						<span className="opacity-80">
							{LABELS[id]} · {averages[id]}
						</span>
					</span>
				))}
				<span className="flex items-center gap-1.5">
					<span className="inline-block h-px w-4 border-current/40 border-t border-dashed" />
					<span className="opacity-60">Avg reader · {AVG_READER_WPM}</span>
				</span>
			</div>

			<div className="h-[220px]">
				<ResponsiveLine
					data={chartData}
					margin={{ top: 12, right: 12, bottom: 48, left: 56 }}
					xScale={{ type: "linear" }}
					yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
					curve="monotoneX"
					enableArea={chartData.length === 1}
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
							<div
								style={{
									background: "var(--popover)",
									color: "var(--foreground)",
									border: "1px solid var(--border)",
									borderRadius: 8,
									padding: "8px 10px",
									boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
									fontSize: 12,
									minWidth: 140,
								}}
							>
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
							</div>
						);
					}}
					markers={[
						{
							axis: "y",
							value: AVG_READER_WPM,
							lineStyle: {
								stroke: theme === "dark" ? "#94a3b8" : "#64748b",
								strokeWidth: 1,
								strokeDasharray: "4 4",
								strokeOpacity: 0.6,
							},
							legend: "",
						},
					]}
				/>
			</div>
		</motion.section>
	);
}
