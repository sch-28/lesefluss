import { ResponsiveLine } from "@nivo/line";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTheme } from "../../contexts/theme-context";
import { queryHooks } from "../../services/db/hooks";
import { formatDuration, formatRelative } from "../../utils/date-utils";
import { AnimatedNumber } from "./stats/animated-number";
import { buildNivoTheme } from "./stats/nivo-theme";

const RSVP_COLOR = "#c94b2a";

interface Props {
	bookId: string;
}

export function BookStatsCard({ bookId }: Props) {
	const { theme } = useTheme();
	const stats = queryHooks.useStatsBook(bookId);
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme]);

	const data = stats.data;
	if (!data || data.sessionCount === 0) return null;

	const sparkline = data.speedSeries.map((p, i) => ({ x: i, y: p.wpm }));
	const showSparkline = sparkline.length >= 2;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="book-detail-card mt-4"
		>
			<h2 className="book-detail-section-title">Your reading</h2>

			<div className="mt-2 grid grid-cols-3 gap-3">
				<Stat
					value={
						<AnimatedNumber
							value={Math.max(1, Math.round(data.totalDurationMs / 60_000))}
							format={(v) => formatDuration(v * 60_000)}
						/>
					}
					label="Total time"
				/>
				<Stat
					value={<AnimatedNumber value={data.sessionCount} />}
					label={data.sessionCount === 1 ? "Session" : "Sessions"}
				/>
				<Stat
					value={<span>{formatRelative(data.lastReadAt ?? Date.now())}</span>}
					label="Last read"
				/>
			</div>

			{showSparkline && (
				<div className="mt-4 h-[110px]">
					<ResponsiveLine
						data={[{ id: "wpm", data: sparkline }]}
						margin={{ top: 22, right: 18, bottom: 8, left: 18 }}
						xScale={{ type: "linear" }}
						yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
						curve="monotoneX"
						colors={[RSVP_COLOR]}
						lineWidth={2}
						enableArea={true}
						areaOpacity={0.15}
						enablePoints={true}
						pointSize={6}
						pointColor={{ from: "color" }}
						pointBorderWidth={2}
						pointBorderColor={{ from: "color" }}
						enablePointLabel={true}
						pointLabel="data.y"
						pointLabelYOffset={-12}
						enableGridX={false}
						enableGridY={false}
						axisBottom={null}
						axisLeft={null}
						theme={nivoTheme}
						animate={true}
						motionConfig="gentle"
						useMesh={true}
						isInteractive={false}
					/>
				</div>
			)}

			{data.avgWpmRsvp != null && (
				<p className="mt-3 text-xs opacity-70">
					Average RSVP target: <span className="font-semibold tabular-nums">{data.avgWpmRsvp}</span>{" "}
					WPM
				</p>
			)}
		</motion.section>
	);
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
	return (
		<div className="text-center">
			<div className="font-bold text-2xl tabular-nums tracking-tight">{value}</div>
			<div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">{label}</div>
		</div>
	);
}
