import { ResponsiveBar } from "@nivo/bar";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import { formatDuration } from "../../../utils/date-utils";
import { buildNivoTheme, getAccentStops } from "./nivo-theme";

export function Personality() {
	const { theme } = useTheme();
	const hours = queryHooks.useStatsHourHistogram();
	const personality = queryHooks.useStatsPersonality();
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);
	const accent = useMemo(() => getAccentStops(theme), [theme]);

	const data = (hours.data ?? new Array<number>(24).fill(0)).map((m, h) => ({
		hour: h.toString().padStart(2, "0"),
		minutes: m,
	}));

	const peakHourIdx = data.reduce((acc, d, i) => (d.minutes > data[acc].minutes ? i : acc), 0);
	const peakLabel =
		peakHourIdx === 0
			? "midnight"
			: peakHourIdx < 12
				? `${peakHourIdx} AM`
				: peakHourIdx === 12
					? "noon"
					: `${peakHourIdx - 12} PM`;

	const callouts = [
		{
			label: "Favorite hour",
			value: peakLabel,
		},
		{
			label: "Longest session",
			value: formatDuration(personality.data?.longestSessionMs ?? 0),
		},
		{
			label: "Fastest WPM",
			value: (personality.data?.fastestWpm ?? 0).toString(),
		},
	];

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.2 }}
			transition={{ duration: 0.5 }}
			className="mb-12 px-4"
		>
			<header className="mb-3">
				<h2 className="font-semibold text-lg">Reading personality</h2>
				<p className="mt-0.5 text-[11px] uppercase tracking-wider opacity-60">
					When you read, how deep, how fast
				</p>
			</header>
			<div className="mb-5 grid grid-cols-3 gap-3">
				{callouts.map((c, i) => (
					<motion.div
						key={c.label}
						initial={{ opacity: 0, y: 8 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: i * 0.08 }}
						className="rounded-xl bg-black/5 p-3 dark:bg-white/5"
					>
						<div className="line-clamp-1 font-semibold text-base tabular-nums tracking-tight">
							{c.value}
						</div>
						<div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">{c.label}</div>
					</motion.div>
				))}
			</div>
			<div className="h-[200px]">
				<ResponsiveBar
					data={data}
					keys={["minutes"]}
					indexBy="hour"
					margin={{ top: 8, right: 8, bottom: 48, left: 48 }}
					padding={0.35}
					colors={[accent.from]}
					borderRadius={3}
					axisBottom={{
						tickSize: 0,
						tickPadding: 6,
						tickValues: ["00", "06", "12", "18"],
						format: (v) => `${v}:00`,
						legend: "Hour of day",
						legendPosition: "middle",
						legendOffset: 36,
					}}
					axisLeft={{
						tickSize: 0,
						tickPadding: 6,
						tickValues: 3,
						legend: "Minutes read",
						legendPosition: "middle",
						legendOffset: -38,
					}}
					enableLabel={false}
					enableGridY={false}
					theme={nivoTheme}
					animate={true}
					motionConfig="gentle"
				/>
			</div>
		</motion.section>
	);
}
