import { ResponsiveCalendar } from "@nivo/calendar";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import { buildNivoTheme, getAccentStops } from "./nivo-theme";

export function ActivityHeatmap() {
	const { theme } = useTheme();
	const streak = queryHooks.useStatsStreak();

	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);
	const accent = useMemo(() => getAccentStops(theme), [theme]);

	const days = streak.data?.last90Days ?? [];
	const data = days.filter((d) => d.minutes > 0).map((d) => ({ day: d.date, value: d.minutes }));

	const from = days[0]?.date;
	const to = days[days.length - 1]?.date;

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
					<h2 className="font-semibold text-lg">Activity</h2>
					<p className="mt-0.5 text-[11px] uppercase tracking-wider opacity-60">Last 90 days</p>
				</div>
				<div className="text-right">
					<div className="font-bold text-3xl tabular-nums leading-none tracking-tight">
						{streak.data?.current ?? 0}
					</div>
					<div className="mt-1 text-[11px] uppercase tracking-wider opacity-60">
						day streak · longest {streak.data?.longest ?? 0}
					</div>
				</div>
			</header>
			<div className="h-[160px] rounded-xl" style={{ background: "transparent" }}>
				{from && to && (
					<ResponsiveCalendar
						data={data}
						from={from}
						to={to}
						emptyColor={theme === "dark" ? "#262626" : "#eeeeee"}
						colors={[accent.from, accent.to]}
						margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
						monthBorderColor="transparent"
						dayBorderWidth={2}
						dayBorderColor="transparent"
						theme={nivoTheme}
					/>
				)}
			</div>
			<div className="mt-2 flex items-center justify-end gap-2 text-[10px] opacity-70">
				<span>Less</span>
				<span
					className="inline-block h-2.5 w-2.5 rounded-sm"
					style={{ backgroundColor: theme === "dark" ? "#262626" : "#eeeeee" }}
				/>
				<span
					className="inline-block h-2.5 w-2.5 rounded-sm"
					style={{ backgroundColor: accent.from, opacity: 0.4 }}
				/>
				<span
					className="inline-block h-2.5 w-2.5 rounded-sm"
					style={{ backgroundColor: accent.from, opacity: 0.7 }}
				/>
				<span
					className="inline-block h-2.5 w-2.5 rounded-sm"
					style={{ backgroundColor: accent.to }}
				/>
				<span>More · minutes read</span>
			</div>
		</motion.section>
	);
}
