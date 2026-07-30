import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { queryHooks } from "../../../services/db/hooks";
import { buildMonthGrid, type CalendarDay, shiftMonth } from "../../../services/stats/calendar";
import { summariseMonth } from "../../../services/stats/summaries";
import { startOfLocalDay } from "../../../utils/date-utils";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Past this far back the month name alone is ambiguous, so the year is shown. */
const MONTHS_BEFORE_YEAR_SHOWN = 11;

/** Tailwind can't build class names at runtime, so the steps are spelled out. */
const INTENSITY_CLASS = [
	"bg-current/10",
	"bg-emerald-500/35",
	"bg-emerald-500/65",
	"bg-emerald-500",
] as const;

export function monthLabelOf(monthAnchor: number, today: number): string {
	return new Date(monthAnchor).toLocaleDateString(undefined, {
		month: "long",
		year: monthAnchor < shiftMonth(today, -MONTHS_BEFORE_YEAR_SHOWN) ? "numeric" : undefined,
	});
}

interface PagerProps {
	monthAnchor: number;
	/** Steps by whole months. A delta rather than the next value so two taps
	 *  landing in one render still move two months. */
	onStep: (delta: number) => void;
}

/**
 * Month stepper. Lives beside the streak headline rather than above the grid so
 * the headline row is not half-empty and the grid starts right under it.
 */
export function MonthPager({ monthAnchor, onStep }: PagerProps) {
	const today = startOfLocalDay(Date.now());

	return (
		<div className="flex shrink-0 items-center gap-1">
			<button
				type="button"
				onClick={() => onStep(-1)}
				aria-label="Previous month"
				className="rounded-md p-1 opacity-60 active:bg-current/10"
			>
				<ChevronLeft className="size-4" />
			</button>
			{/* Fixed width so stepping between "May" and "September" doesn't shift
			    the chevrons out from under the reader's thumb. */}
			<span className="w-[5.5rem] text-center font-medium text-xs uppercase tracking-wider opacity-70">
				{monthLabelOf(monthAnchor, today)}
			</span>
			<button
				type="button"
				disabled={monthAnchor >= shiftMonth(today, 0)}
				onClick={() => onStep(1)}
				aria-label="Next month"
				className="rounded-md p-1 opacity-60 active:bg-current/10 disabled:opacity-20"
			>
				<ChevronRight className="size-4" />
			</button>
		</div>
	);
}

export function StreakCalendar({ monthAnchor }: { monthAnchor: number }) {
	const daily = queryHooks.useStatsDailyMs();

	const grid = useMemo(
		() => buildMonthGrid(daily.data ?? new Map(), monthAnchor),
		[daily.data, monthAnchor],
	);

	const today = startOfLocalDay(Date.now());

	return (
		<div
			className="mt-4 grid grid-cols-7 gap-y-1"
			role="img"
			aria-label={summariseMonth(grid, monthLabelOf(monthAnchor, today))}
		>
			{WEEKDAY_INITIALS.map((initial, i) => (
				<span
					// Weekday initials repeat (T, T and S, S), so the index is the key.
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static row
					key={i}
					className="pb-1 text-center text-[10px] opacity-40"
				>
					{initial}
				</span>
			))}
			{grid.map((day) => (
				<DayCell key={day.dateKey} day={day} isToday={day.dayStart === today} />
			))}
		</div>
	);
}

function DayCell({ day, isToday }: { day: CalendarDay; isToday: boolean }) {
	const isLinked = day.linksBefore || day.linksAfter;

	return (
		<div className="relative flex h-7 items-center justify-center">
			{/* A run of days is drawn as one capsule behind the dots rather than a
			    wire through them, so a streak reads as a single object. It runs to
			    the cell edge where the streak continues, which carries it across a
			    week boundary onto the next row; the rounded end is what marks where
			    a streak actually stops. An isolated day gets no capsule at all. */}
			{isLinked && (
				<span
					aria-hidden="true"
					className={`absolute inset-y-1 bg-emerald-500/15 ${
						day.linksBefore ? "left-0" : "left-1 rounded-l-full"
					} ${day.linksAfter ? "right-0" : "right-1 rounded-r-full"}`}
				/>
			)}
			<span
				className={`relative size-2.5 rounded-full ${INTENSITY_CLASS[day.intensity]} ${
					day.isInMonth ? "" : "opacity-30"
				} ${isToday ? "ring-2 ring-current/40 ring-offset-1 ring-offset-card" : ""}`}
			/>
		</div>
	);
}
