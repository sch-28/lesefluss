import { useMemo } from "react";
import { useLocalDayNow } from "../../../hooks/use-local-day";
import { queryHooks } from "../../../services/db/hooks";
import { NO_READING, weeklyHours } from "../../../services/stats/calendar";
import { StatsSection } from "./section-header";

const WEEKS = 12;
const WIDTH = 358;
const HEIGHT = 170;
const PLOT_LEFT = 36;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 148;

function axisStep(maxHours: number): number {
	for (const step of [1, 2, 5, 10, 20, 50]) {
		if (maxHours <= step * 3) return step;
	}
	return 100;
}

/** Hours read per week over the last twelve weeks; the current week is faded as it is not over. */
export function Activity() {
	const now = useLocalDayNow();
	const daily = queryHooks.useStatsDailyReading();
	// While loading the axes draw with empty weeks, so the card already has its loaded height.
	const weeks = useMemo(() => weeklyHours(daily.data ?? NO_READING, now, WEEKS), [daily.data, now]);

	const step = axisStep(Math.max(0, ...weeks.map((w) => w.hours)));
	const top = step * 3;
	const y = (hours: number) => PLOT_BOTTOM - (hours / top) * (PLOT_BOTTOM - PLOT_TOP);
	const slot = (WIDTH - PLOT_LEFT) / WEEKS;
	const barWidth = slot * 0.6;
	const total = weeks.reduce((sum, w) => sum + w.hours, 0);

	return (
		<StatsSection
			title="Reading hours"
			aside={`per week · last ${WEEKS} weeks`}
			data-testid="stats-reading-hours"
		>
			<div className="rounded-[14px] border border-border bg-card p-4">
				<svg
					viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					className="block h-auto w-full"
					role="img"
					aria-label={`${Math.round(total)} hours read in the last ${WEEKS} weeks`}
				>
					{[0, 1, 2, 3].map((i) => (
						<g key={i}>
							<line
								x1={PLOT_LEFT}
								x2={WIDTH}
								y1={y(i * step)}
								y2={y(i * step)}
								className="stroke-border"
							/>
							<text
								x={PLOT_LEFT - 6}
								y={y(i * step) + 4}
								textAnchor="end"
								className="fill-muted-foreground text-[11px]"
							>
								{i * step} h
							</text>
						</g>
					))}
					{weeks.map((week, i) => {
						const x = PLOT_LEFT + i * slot + (slot - barWidth) / 2;
						return (
							<g key={week.weekStart}>
								{week.hours > 0 && (
									<rect
										x={x}
										y={y(week.hours)}
										width={barWidth}
										height={PLOT_BOTTOM - y(week.hours)}
										rx={3}
										className="fill-primary"
										opacity={week.isCurrent ? 0.45 : 1}
									/>
								)}
								{(WEEKS - 1 - i) % 3 === 0 && (
									<text
										x={x + barWidth / 2}
										y={HEIGHT - 6}
										textAnchor="middle"
										className="fill-muted-foreground text-[11px]"
									>
										{new Date(week.weekStart).toLocaleDateString(undefined, {
											month: "short",
											day: "numeric",
										})}
									</text>
								)}
							</g>
						);
					})}
				</svg>
			</div>
		</StatsSection>
	);
}
