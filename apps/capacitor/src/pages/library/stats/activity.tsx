import { ResponsiveBar } from "@nivo/bar";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import { queryHooks } from "../../../services/db/hooks";
import { summariseHours } from "../../../services/stats/summaries";
import { buildNivoTheme, getAccentStops } from "./nivo-theme";

export function Activity() {
	const { theme } = useTheme();
	const hours = queryHooks.useStatsHourHistogram();

	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);
	const accent = useMemo(() => getAccentStops(theme), [theme]);

	const hourData = (hours.data ?? new Array<number>(24).fill(0)).map((minutes, hour) => ({
		hour: hour.toString().padStart(2, "0"),
		minutes,
	}));

	// Charts render as SVG, which a screen reader reads as loose numbers or skips
	// entirely. nivo already puts role="img" on the svg; these give it a label.
	const hoursSummary = useMemo(() => summariseHours(hours.data ?? []), [hours.data]);

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-10 px-4"
		>
			<header className="mb-3">
				<h2 className="font-semibold text-lg">Reading hours</h2>
			</header>
			<div className="mt-3 h-[180px]" role="img" aria-label={hoursSummary}>
				<ResponsiveBar
					role="presentation"
					data={hourData}
					keys={["minutes"]}
					indexBy="hour"
					margin={{ top: 8, right: 8, bottom: 44, left: 44 }}
					padding={0.35}
					colors={[accent.from]}
					borderRadius={3}
					axisBottom={{
						tickSize: 0,
						tickPadding: 6,
						tickValues: ["00", "06", "12", "18"],
						format: (v) => `${v}:00`,
						legend: "Hour of day · all time",
						legendPosition: "middle",
						legendOffset: 34,
					}}
					axisLeft={{
						tickSize: 0,
						tickPadding: 6,
						tickValues: 3,
						legend: "Minutes",
						legendPosition: "middle",
						legendOffset: -34,
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
