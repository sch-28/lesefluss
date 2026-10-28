import { addDays, dayNumberOf } from "@lesefluss/core";
import type { LineCustomSvgLayerProps, LineSvgLayer } from "@nivo/line";
import { ResponsiveLine } from "@nivo/line";
import { useMemo } from "react";
import { useTheme } from "../../../contexts/theme-context";
import type { GoalSeriesPoint } from "../../../services/stats/reading-goal";
import { formatDayKey } from "../../../utils/date-utils";
import { buildNivoTheme } from "../stats/nivo-theme";

// Theme tokens, set as style rather than attributes: SVG attributes do not resolve var().
const ACTUAL_COLOR = "var(--goal-progress)";

type GoalSeries = { id: "history" | "plan" | "actual"; data: { x: number; y: number }[] };

const LINE_STYLE: Record<
	GoalSeries["id"],
	{ stroke: string; width: number; dash?: string; opacity?: number }
> = {
	history: { stroke: "currentColor", width: 1.5, opacity: 0.35 },
	plan: { stroke: "currentColor", width: 1.5, dash: "4 4", opacity: 0.55 },
	actual: { stroke: ACTUAL_COLOR, width: 2.5 },
};

const CHART_MARGIN = { top: 8, right: 24, bottom: 24, left: 36 } as const;
const X_SCALE = { type: "linear", min: 0, max: "auto" } as const;
const Y_SCALE = { type: "linear", min: 0, max: 100, stacked: false } as const;
const Y_TICKS = [0, 50, 100];
const AXIS_LEFT = {
	tickSize: 0,
	tickPadding: 6,
	tickValues: Y_TICKS,
	format: (v: unknown) => `${v}%`,
} as const;

/**
 * Plan dashed, actual solid, and a "today" rule. Drawn as one custom layer
 * because nivo's own line layer cannot dash a single series.
 */
function GoalLines({ series, lineGenerator, innerHeight }: LineCustomSvgLayerProps<GoalSeries>) {
	const actual = series.find((s) => s.id === "actual");
	const last = actual?.data.at(-1)?.position;
	return (
		<g>
			{series.map((s) => {
				const style = LINE_STYLE[s.id];
				return (
					<path
						key={s.id}
						d={lineGenerator(s.data.map((d) => d.position)) ?? undefined}
						fill="none"
						stroke={style.stroke}
						strokeOpacity={style.opacity}
						strokeWidth={style.width}
						strokeDasharray={style.dash}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				);
			})}
			{last && (
				<>
					<line
						x1={last.x}
						x2={last.x}
						y1={0}
						y2={innerHeight}
						stroke="currentColor"
						strokeOpacity={0.25}
					/>
					<circle cx={last.x} cy={last.y} r={3.5} style={{ fill: ACTUAL_COLOR }} />
					<text
						x={last.x + 4}
						y={innerHeight - 4}
						textAnchor="start"
						fontSize="0.625rem"
						fill="currentColor"
						fillOpacity={0.6}
					>
						today
					</text>
				</>
			)}
		</g>
	);
}

const LAYERS: LineSvgLayer<GoalSeries>[] = ["grid", "axes", GoalLines];

type Props = {
	planSeries: GoalSeriesPoint[];
	actualSeries: GoalSeriesPoint[];
	/** Reading before the goal, drawn muted and unjudged. */
	historySeries: GoalSeriesPoint[];
	ariaLabel: string;
};

/** Days since the first point, so all three series share one x axis. */
function toLine(points: GoalSeriesPoint[], origin: number) {
	return points.map((p) => ({ x: (dayNumberOf(p.date) ?? origin) - origin, y: p.percent }));
}

/**
 * Day offsets for the x-axis labels: first and last. The plan's first point is
 * its 0% anchor at the end of the day before the goal starts, so without
 * history in front the first label is the start day, one after it.
 */
export function axisTicks(hasHistory: boolean, span: number): number[] {
	const first = hasHistory ? 0 : Math.min(1, span);
	return span > first ? [first, span] : [span];
}

export function GoalChart({ planSeries, actualSeries, historySeries, ariaLabel }: Props) {
	const { theme, isEinkMode } = useTheme();
	// biome-ignore lint/correctness/useExhaustiveDependencies: isEinkMode re-reads the CSS variables
	const nivoTheme = useMemo(() => buildNivoTheme(theme), [theme, isEinkMode]);

	const hasHistory = historySeries.length > 1;
	const firstDate = (hasHistory ? historySeries[0]?.date : planSeries[0]?.date) ?? "";
	const lastDate = planSeries.at(-1)?.date ?? firstDate;
	const origin = dayNumberOf(firstDate) ?? 0;
	const span = (dayNumberOf(lastDate) ?? origin) - origin;

	const data = useMemo<GoalSeries[]>(
		() => [
			...(hasHistory ? [{ id: "history" as const, data: toLine(historySeries, origin) }] : []),
			{ id: "plan", data: toLine(planSeries, origin) },
			{ id: "actual", data: toLine(actualSeries, origin) },
		],
		[hasHistory, historySeries, planSeries, actualSeries, origin],
	);
	const axisBottom = useMemo(
		() => ({
			tickSize: 0,
			tickPadding: 6,
			tickValues: axisTicks(hasHistory, span),
			format: (v: unknown) => (firstDate ? formatDayKey(addDays(firstDate, Number(v))) : ""),
		}),
		[hasHistory, span, firstDate],
	);

	return (
		<figure className="m-0">
			<div className="h-[130px]" role="img" aria-label={ariaLabel}>
				<ResponsiveLine
					role="presentation"
					data={data}
					margin={CHART_MARGIN}
					xScale={X_SCALE}
					yScale={Y_SCALE}
					layers={LAYERS}
					enableGridX={false}
					gridYValues={Y_TICKS}
					axisBottom={axisBottom}
					axisLeft={AXIS_LEFT}
					theme={nivoTheme}
					isInteractive={false}
					animate={false}
				/>
			</div>
			<figcaption className="mt-1 flex gap-3.5 text-[11px] opacity-70">
				<span className="flex items-center gap-1.5">
					<span className="w-3.5 border-t-2" style={{ borderColor: ACTUAL_COLOR }} />
					actual
				</span>
				<span className="flex items-center gap-1.5">
					<span className="w-3.5 border-current/55 border-t-2 border-dashed" />
					plan
				</span>
				{hasHistory && (
					<span className="flex items-center gap-1.5">
						<span className="w-3.5 border-current/35 border-t-2" />
						before goal
					</span>
				)}
			</figcaption>
		</figure>
	);
}
