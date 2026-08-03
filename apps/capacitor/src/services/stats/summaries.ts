/**
 * One-sentence text equivalents of the stats charts.
 *
 * Charts render as SVG, which a screen reader either skips or reads as a pile of
 * numbers, so each one needs a sentence that carries the same finding. Kept pure
 * and separate from the components: a string is far easier to assert than a
 * rendered chart.
 */
import { formatDuration } from "../../utils/date-utils";
import { AVERAGE_READER_WPM } from "../../utils/reading-time";
import type { SpeedBucket, WpmTrend } from "./aggregate";
import type { CalendarDay } from "./calendar";

const MS_PER_MINUTE = 60_000;

function formatHour(hour: number): string {
	return `${String(hour).padStart(2, "0")}:00`;
}

function formatDayLong(epochMs: number): string {
	return new Date(epochMs).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/**
 * Text equivalent of a streak dot range: the month calendar or the collapsed
 * week strip. Padding days (`isInMonth` false) are excluded from the counts so
 * the sentence describes the same days the grid emphasises.
 */
export function summariseDays(days: CalendarDay[], rangeLabel: string): string {
	const inRange = days.filter((day) => day.isInMonth);
	// `intensity` already carries the thresholded verdict, so the label counts the
	// same days the grid lights up. Filtering on `durationMs > 0` announced
	// reading that is not drawn.
	const read = inRange.filter((day) => day.intensity > 0);
	if (read.length === 0) return `${rangeLabel}: no reading recorded.`;

	const totalMs = read.reduce((sum, day) => sum + day.durationMs, 0);
	const best = read.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
	return (
		`${rangeLabel}: read on ${read.length} of ${inRange.length} days, ` +
		`${formatDuration(totalMs)} in total. ` +
		`Longest day was ${formatDayLong(best.dayStart)} at ${formatDuration(best.durationMs)}.`
	);
}

export function summariseHours(hours: number[]): string {
	const total = hours.reduce((sum, m) => sum + m, 0);
	// An all-zero array has a maximum too, and reporting it would name midnight as
	// this reader's favourite hour on the strength of no data at all.
	if (total === 0) return "No reading recorded yet, so there is no busiest hour.";

	let peak = 0;
	for (let hour = 1; hour < hours.length; hour++) {
		if ((hours[hour] ?? 0) > (hours[peak] ?? 0)) peak = hour;
	}
	const share = Math.round(((hours[peak] ?? 0) / total) * 100);
	return (
		`Busiest reading hour is ${formatHour(peak)}, ` +
		`${formatDuration((hours[peak] ?? 0) * MS_PER_MINUTE)} of ${formatDuration(total * MS_PER_MINUTE)} all time (${share}%).`
	);
}

export function summariseWpmTrend(trend: WpmTrend, periodLabel: string): string {
	const points = trend.measured.filter((p) => p.avgWpm > 0);
	if (points.length === 0) return "No reading speed recorded for this period.";

	const rates = points.map((p) => p.avgWpm);
	const low = Math.min(...rates);
	const high = Math.max(...rates);
	const range =
		low === high
			? `steady at ${low}`
			: `ranging from ${low} to ${high} across ${points.length} points`;
	const target =
		trend.averages.rsvpTarget > 0 ? ` RSVP dial set to ${trend.averages.rsvpTarget}.` : "";
	return (
		`${periodLabel}: ${trend.averages.measured} words per minute on average, ${range}. ` +
		`A typical reader manages about ${AVERAGE_READER_WPM}.${target}`
	);
}

export function summariseSpeedBuckets(buckets: SpeedBucket[]): string {
	if (buckets.length === 0) return "Not enough reading yet to show a speed trend.";

	const rates = buckets.map((b) => b.wpm);
	const low = Math.min(...rates);
	const high = Math.max(...rates);
	const sittings = buckets.reduce((sum, b) => sum + b.sessions, 0);
	const first = buckets[0]?.wpm ?? 0;
	const last = buckets[buckets.length - 1]?.wpm ?? 0;
	const direction = last > first ? "speeding up" : last < first ? "slowing down" : "holding steady";

	return (
		`Speed across ${sittings} ${sittings === 1 ? "sitting" : "sittings"}, ` +
		`from ${low} to ${high} words per minute, ${direction} from ${first} to ${last}.`
	);
}
