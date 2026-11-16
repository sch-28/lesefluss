import { AVERAGE_READER_WPM, type SpeedWindow } from "@lesefluss/core";
import { useRef } from "react";
import { useElementWidth } from "../../../hooks/use-element-width";
import { queryHooks } from "../../../services/db/hooks";
import type { SpeedTrendMode } from "../../../services/db/queries/stats";
import type { TrendGranularity, TrendTestMarker } from "../../../services/stats/aggregate";
import { summariseWpmTrend } from "../../../services/stats/summaries";
import { formatDate } from "../../../utils/date-utils";
import { evenTickIndices, formatDayTick } from "./chart-axis";

/** Until the card is measured; the chart then draws at its real width so text never scales. */
const DEFAULT_WIDTH = 358;
const HEIGHT = 150;
const PLOT_LEFT = 30;
// Room right of the plot for the reference line labels, so they never sit on the line.
const LABEL_GUTTER = 50;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 120;
const GRID_LINES = 4;
const MAX_X_LABELS = 4;
const AXIS_STEPS = [10, 20, 25, 50, 100, 200, 500];

const NO_TESTS: TrendTestMarker[] = [];

/**
 * The y-axis around the data, not from zero: three steps that cover the lowest and
 * highest value, so a 20 wpm change reads as a change and not as a flat line.
 */
export function wpmAxisDomain(values: readonly number[]): {
	min: number;
	max: number;
	step: number;
} {
	const shown = values.filter((v) => v > 0);
	if (shown.length === 0) return { min: 0, max: 300, step: 100 };
	const low = Math.min(...shown);
	const high = Math.max(...shown);
	for (const step of AXIS_STEPS) {
		const min = Math.floor(low / step) * step;
		if (min + step * (GRID_LINES - 1) >= high)
			return { min, max: min + step * (GRID_LINES - 1), step };
	}
	const step = AXIS_STEPS.at(-1) ?? 500;
	const min = Math.floor(low / step) * step;
	return { min, max: min + step * Math.ceil((high - min) / step), step };
}

/** The x-axis starts at the first bucket with data, so a window's empty start isn't drawn. */
export function firstShownBucket(
	measured: readonly { avgWpm: number }[],
	tests: readonly TrendTestMarker[],
): number {
	const firstReading = measured.findIndex((p) => p.avgWpm > 0);
	const candidates = [
		...(firstReading >= 0 ? [firstReading] : []),
		...tests.map((t) => t.bucketIndex),
	];
	return candidates.length > 0 ? Math.max(0, Math.min(...candidates)) : 0;
}

function formatBucketTick(start: number, granularity: TrendGranularity): string {
	const d = new Date(start);
	switch (granularity) {
		case "hour":
			return d.toLocaleTimeString(undefined, { hour: "numeric" });
		case "month":
			return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
		default:
			return formatDayTick(start);
	}
}

/** The x-axis legend names the window and the dates it covers, so "Last 10h" over two weeks of ticks reads right. */
export function trendAxisLegend(windowLabel: string, bucketStarts: readonly number[]): string {
	const first = bucketStarts[0];
	const last = bucketStarts.at(-1);
	if (first === undefined || last === undefined) return windowLabel;
	const from = formatDate(first);
	const to = formatDate(last);
	return from === to ? `${windowLabel} · ${from}` : `${windowLabel} · ${from} – ${to}`;
}

function ChartFrame({
	width,
	label,
	children,
}: {
	width: number;
	label: string;
	children?: React.ReactNode;
}) {
	return (
		<svg
			viewBox={`0 0 ${width} ${HEIGHT}`}
			className="block w-full"
			style={{ height: HEIGHT }}
			role="img"
			aria-label={label}
		>
			{children}
		</svg>
	);
}

interface Props {
	window: SpeedWindow;
	mode: SpeedTrendMode;
	windowLabel: string;
	now: number;
}

/** The measured element stays mounted across loading and mode switches, so the width keeps following it. */
export function WpmTrend(props: Props) {
	const frameRef = useRef<HTMLDivElement>(null);
	const width = useElementWidth(frameRef) || DEFAULT_WIDTH;
	return (
		<div ref={frameRef}>
			<WpmTrendChart {...props} width={width} />
		</div>
	);
}

function WpmTrendChart({ window, mode, windowLabel, now, width }: Props & { width: number }) {
	const trend = queryHooks.useStatsWpmTrend(window, mode, now);
	const plotRight = width - LABEL_GUTTER;
	const data = trend.data;
	const tests = data?.tests ?? NO_TESTS;

	if (!data) {
		return (
			<div data-testid="wpm-trend-loading">
				<ChartFrame width={width} label="Reading speed chart" />
			</div>
		);
	}

	const measured = data.measured;
	const hasReading = measured.some((p) => p.avgWpm > 0);
	if (!hasReading && tests.length === 0) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				Not enough reading in this window for a trend.
			</p>
		);
	}

	const start = firstShownBucket(measured, tests);
	const end = Math.max(start, measured.length - 1);
	const x = (i: number) =>
		end === start ? plotRight : PLOT_LEFT + ((i - start) / (end - start)) * (plotRight - PLOT_LEFT);
	const domain = wpmAxisDomain([...measured.map((p) => p.avgWpm), ...tests.map((t) => t.wpm)]);
	const y = (wpm: number) =>
		PLOT_BOTTOM - ((wpm - domain.min) / (domain.max - domain.min)) * (PLOT_BOTTOM - PLOT_TOP);
	const inRange = (wpm: number) => wpm >= domain.min && wpm <= domain.max;

	const points = measured.flatMap((p, i) =>
		p.avgWpm > 0 && i >= start ? [{ x: x(i), y: y(p.avgWpm) }] : [],
	);
	const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
	const first = points[0];
	const last = points.at(-1);
	const area =
		first && last
			? `M${first.x.toFixed(1)},${PLOT_BOTTOM} L${line.split(" ").join(" L")} L${last.x.toFixed(1)},${PLOT_BOTTOM} Z`
			: null;

	const shownStarts = measured.slice(start, end + 1).map((p) => p.bucketStart);
	const ticks = evenTickIndices(shownStarts.length, MAX_X_LABELS);
	const dial = data.averages.rsvpTarget;

	return (
		<div data-testid="wpm-trend">
			<ChartFrame
				width={width}
				label={summariseWpmTrend(data, trendAxisLegend(windowLabel, shownStarts))}
			>
				{Array.from({ length: GRID_LINES }, (_, i) => {
					const wpm = domain.min + i * domain.step;
					return (
						<g key={wpm}>
							<line
								x1={PLOT_LEFT}
								x2={plotRight}
								y1={y(wpm)}
								y2={y(wpm)}
								className="stroke-border"
							/>
							<text
								x={PLOT_LEFT - 6}
								y={y(wpm) + 4}
								textAnchor="end"
								className="fill-muted-foreground text-[10px]"
							>
								{wpm}
							</text>
						</g>
					);
				})}
				{area && <path d={area} className="fill-primary" opacity={0.12} />}
				{inRange(AVERAGE_READER_WPM) && (
					<ReferenceLine
						y={y(AVERAGE_READER_WPM)}
						plotRight={plotRight}
						lines={["Avg", "reader"]}
						testId="wpm-trend-avg"
					/>
				)}
				{dial > 0 && inRange(dial) && (
					<ReferenceLine
						y={y(dial)}
						plotRight={plotRight}
						lines={["Dial"]}
						testId="wpm-trend-dial"
					/>
				)}
				{points.length > 1 && (
					<polyline
						points={line}
						className="fill-none stroke-primary"
						strokeWidth={2}
						strokeLinejoin="round"
					/>
				)}
				{points.map((p) => (
					<circle key={p.x} cx={p.x} cy={p.y} r={2.5} className="fill-primary" />
				))}
				{last && (
					<circle
						cx={last.x}
						cy={last.y}
						r={4.5}
						className="fill-primary stroke-card"
						strokeWidth={2}
					/>
				)}
				{tests.map((test) => {
					const tx = x(Math.max(start, test.bucketIndex));
					const ty = y(test.wpm);
					return (
						<g key={test.takenAt} data-testid="wpm-trend-test">
							<rect
								x={tx - 4}
								y={ty - 4}
								width={8}
								height={8}
								transform={`rotate(45 ${tx} ${ty})`}
								className="fill-foreground stroke-card"
								strokeWidth={1.5}
							/>
						</g>
					);
				})}
				{ticks.map((i, n) => {
					const bucketStart = shownStarts[i];
					if (bucketStart === undefined) return null;
					const anchor = n === 0 ? "start" : n === ticks.length - 1 ? "end" : "middle";
					return (
						<text
							key={bucketStart}
							x={x(start + i)}
							y={HEIGHT - 10}
							textAnchor={ticks.length === 1 ? "end" : anchor}
							className="fill-muted-foreground text-[10px]"
							data-testid="wpm-trend-tick"
						>
							{formatBucketTick(bucketStart, data.granularity)}
						</text>
					);
				})}
			</ChartFrame>
			{tests.length > 0 && (
				<p className="m-0 mt-1 text-muted-foreground text-xs">
					<span aria-hidden="true">◆</span> Speed test
				</p>
			)}
		</div>
	);
}

function ReferenceLine({
	y,
	plotRight,
	lines,
	testId,
}: {
	y: number;
	plotRight: number;
	lines: string[];
	testId: string;
}) {
	return (
		<g data-testid={testId}>
			<line
				x1={PLOT_LEFT}
				x2={plotRight}
				y1={y}
				y2={y}
				className="stroke-muted-foreground"
				strokeDasharray="3 3"
			/>
			{lines.map((text, i) => (
				<text
					key={text}
					x={plotRight + 6}
					y={y - 2 + i * 13}
					className="fill-muted-foreground text-[10px]"
				>
					{text}
				</text>
			))}
		</g>
	);
}
