import { ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import { buildNivoTheme } from "./nivo-theme";

const COLORS = {
	rsvpTarget: "#c94b2a", // brand orange
	rsvpDelivered: "#f4a261", // soft sand
	read: { dark: "#94a3b8", light: "#475569" }, // slate
} as const;

const AVG_READER_WPM = 250;

type SeriesId = "rsvpTarget" | "rsvpDelivered" | "read";

const LABELS: Record<SeriesId, string> = {
	rsvpTarget: "RSVP target",
	rsvpDelivered: "RSVP delivered",
	read: "Reading speed",
};

function avgOf(series: Array<{ y: number }>): number {
	const nonZero = series.filter((p) => p.y > 0);
	if (nonZero.length === 0) return 0;
	return Math.round(nonZero.reduce((a, p) => a + p.y, 0) / nonZero.length);
}

export function WpmTrend() {
	const { theme } = useTheme();
	const weekly = queryHooks.useStatsWeeklyWpm(12);
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);

	const colors: Record<SeriesId, string> = {
		rsvpTarget: COLORS.rsvpTarget,
		rsvpDelivered: COLORS.rsvpDelivered,
		read: theme === "dark" ? COLORS.read.dark : COLORS.read.light,
	};

	const seriesData: Record<SeriesId, Array<{ x: number; y: number }>> = {
		rsvpTarget: (weekly.data?.rsvpTarget ?? []).map((w, i) => ({ x: i, y: w.avgWpm })),
		rsvpDelivered: (weekly.data?.rsvpDelivered ?? []).map((w, i) => ({ x: i, y: w.avgWpm })),
		read: (weekly.data?.read ?? []).map((w, i) => ({ x: i, y: w.avgWpm })),
	};

	const present: SeriesId[] = (["rsvpTarget", "rsvpDelivered", "read"] as const).filter((id) =>
		seriesData[id].some((p) => p.y > 0),
	);

	if (!weekly.isLoading && present.length === 0) {
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

	const headlineId: SeriesId | null =
		(["rsvpTarget", "read", "rsvpDelivered"] as const).find((id) => present.includes(id)) ?? null;
	const headlineAvg = headlineId ? avgOf(seriesData[headlineId]) : 0;
	const headlineLabel = headlineId ? `${LABELS[headlineId]} avg` : "";

	const chartData = present.map((id) => ({
		id: LABELS[id],
		color: colors[id],
		data: seriesData[id],
	}));

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
						12-week avg · words per minute
					</p>
				</div>
				<div className="text-right">
					<div className="font-bold text-3xl tabular-nums leading-none tracking-tight">
						{headlineAvg}
					</div>
					<div className="mt-1 text-[11px] uppercase tracking-wider opacity-60">
						{headlineLabel}
					</div>
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
							{LABELS[id]} · {avgOf(seriesData[id])}
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
						tickValues: [0, 3, 6, 9, 11],
						format: (v) => {
							const n = typeof v === "number" ? v : Number(v);
							const weeksAgo = 11 - n;
							return weeksAgo === 0 ? "now" : `${weeksAgo}w ago`;
						},
						legend: "Past 12 weeks",
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
						const weeksAgo = 11 - x;
						const when = weeksAgo === 0 ? "this week" : `${weeksAgo}w ago`;
						return (
							<div
								style={{
									background: "var(--ion-card-background)",
									color: "var(--ion-text-color)",
									border: "1px solid var(--ion-border-color)",
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
