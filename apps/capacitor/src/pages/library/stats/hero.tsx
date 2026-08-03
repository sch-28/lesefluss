import { motion } from "framer-motion";
import { CalendarDays, ChevronUp } from "lucide-react";
import { useState } from "react";
import { shiftMonth } from "../../../services/stats/calendar";
import { AnimatedNumber } from "./animated-number";
import { MonthPager, StreakCalendar, StreakWeekStrip } from "./streak-calendar";

interface Props {
	currentStreak: number;
	longestStreak: number;
}

export function Hero({ currentStreak, longestStreak }: Props) {
	// Collapsed by default: the current week answers "is my streak alive" in one
	// row, and the month grid is a browsing view rather than a landing view.
	const [isExpanded, setIsExpanded] = useState(false);
	// The month lives here rather than in the calendar because the pager sits in
	// the headline row while the grid it drives is a sibling below it.
	const [monthAnchor, setMonthAnchor] = useState(() => shiftMonth(Date.now(), 0));

	const expand = () => {
		setMonthAnchor(shiftMonth(Date.now(), 0));
		setIsExpanded(true);
	};

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5 }}
			className="mx-4 mt-3 mb-6 rounded-2xl border border-current/10 bg-card p-5 text-card-foreground"
		>
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="text-[11px] uppercase tracking-[0.18em] opacity-60">Reading streak</p>
					<div className="mt-1.5 flex items-baseline gap-2">
						<AnimatedNumber
							value={currentStreak}
							className="font-bold text-5xl tabular-nums leading-none tracking-tight"
						/>
						<span className="text-base opacity-70">{currentStreak === 1 ? "day" : "days"}</span>
					</div>
					<p className="mt-1.5 text-xs opacity-50">
						🔥 Best {longestStreak} {longestStreak === 1 ? "day" : "days"}
					</p>
				</div>
				{isExpanded ? (
					<div className="flex shrink-0 items-center gap-1">
						<MonthPager
							monthAnchor={monthAnchor}
							onStep={(delta) => setMonthAnchor((month) => shiftMonth(month, delta))}
						/>
						<button
							type="button"
							onClick={() => setIsExpanded(false)}
							aria-label="Show current week"
							className="rounded-md p-1 opacity-60 active:bg-current/10"
						>
							<ChevronUp className="size-4" />
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={expand}
						aria-label="Show month calendar"
						className="flex shrink-0 items-center gap-1.5 rounded-md p-1.5 opacity-60 active:bg-current/10"
					>
						<CalendarDays className="size-4" />
					</button>
				)}
			</div>

			{isExpanded ? <StreakCalendar monthAnchor={monthAnchor} /> : <StreakWeekStrip />}
		</motion.section>
	);
}
