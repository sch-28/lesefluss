import { useMemo, useRef } from "react";
import { useElementWidth } from "../../../hooks/use-element-width";
import { useLocalDayNow } from "../../../hooks/use-local-day";
import { queryHooks } from "../../../services/db/hooks";
import { NO_READING, type WeekTotal, weeklyHours } from "../../../services/stats/calendar";
import { formatDate } from "../../../utils/date-utils";
import { StatsSection } from "./section-header";

const WEEKS = 12;
/** Fewer bars than this would draw each one a quarter of the card wide. */
const MIN_WEEKS = 4;
/** Until the card is measured; the chart then draws at its real width so text never scales. */
const DEFAULT_WIDTH = 326;
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

/** The axis starts at the first week with reading, so a new reader's chart isn't mostly empty. */
export function shownWeeks(weeks: readonly WeekTotal[]): WeekTotal[] {
	const first = weeks.findIndex((w) => w.hours > 0);
	if (first < 0) return [...weeks];
	return weeks.slice(Math.min(first, Math.max(0, weeks.length - MIN_WEEKS)));
}

/** Hours read per week over the last twelve weeks; the current week is faded as it is not over. */
export function Activity() {
	const now = useLocalDayNow();
	const daily = queryHooks.useStatsDailyReading();
	const frameRef = useRef<HTMLDivElement>(null);
	const width = useElementWidth(frameRef) || DEFAULT_WIDTH;
	// While loading the axes draw with empty weeks, so the card already has its loaded height.
	const weeks = useMemo(
		() => shownWeeks(weeklyHours(daily.data ?? NO_READING, now, WEEKS)),
		[daily.data, now],
	);

	const step = axisStep(Math.max(0, ...weeks.map((w) => w.hours)));
	const top = step * 3;
	const y = (hours: number) => PLOT_BOTTOM - (hours / top) * (PLOT_BOTTOM - PLOT_TOP);
	const slot = (width - PLOT_LEFT) / weeks.length;
	const barWidth = Math.min(slot * 0.6, 40);
	const total = weeks.reduce((sum, w) => sum + w.hours, 0);

	return (
		<StatsSection
			title="Reading hours"
			aside={`per week · last ${weeks.length} weeks`}
			data-testid="stats-reading-hours"
		>
			<div className="rounded-xl border border-border bg-card p-4">
				<div ref={frameRef}>
					<svg
						viewBox={`0 0 ${width} ${HEIGHT}`}
						className="block w-full"
						style={{ height: HEIGHT }}
						role="img"
						aria-label={`${Math.round(total)} hours read in the last ${weeks.length} weeks`}
					>
						{[0, 1, 2, 3].map((i) => (
							<g key={i}>
								<line
									x1={PLOT_LEFT}
									x2={width}
									y1={y(i * step)}
									y2={y(i * step)}
									className="stroke-border"
								/>
								<text
									x={PLOT_LEFT - 6}
									y={y(i * step) + 4}
									textAnchor="end"
									// ui-rules-allow: font-size -- SVG text in the chart's user units, scaled with its viewBox
									className="fill-muted-foreground text-[11px]"
								>
									{i * step} h
								</text>
							</g>
						))}
						{weeks.map((week, i) => {
							const x = PLOT_LEFT + i * slot + (slot - barWidth) / 2;
							const isLast = i === weeks.length - 1;
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
									{(weeks.length - 1 - i) % 3 === 0 && (
										<text
											x={isLast ? x + barWidth : x + barWidth / 2}
											y={HEIGHT - 6}
											textAnchor={isLast ? "end" : "middle"}
											// ui-rules-allow: font-size -- SVG text in the chart's user units, scaled with its viewBox
											className="fill-muted-foreground text-[11px]"
										>
											{/* An axis tick never carries a year: it would crowd its neighbours. */}
											{formatDate(week.weekStart, week.weekStart)}
										</text>
									)}
								</g>
							);
						})}
					</svg>
				</div>
			</div>
		</StatsSection>
	);
}
