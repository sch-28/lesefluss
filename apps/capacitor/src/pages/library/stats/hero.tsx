import { motion } from "framer-motion";
import { useState } from "react";
import { shiftMonth } from "../../../services/stats/calendar";
import { AnimatedNumber } from "./animated-number";
import { MonthPager, StreakCalendar } from "./streak-calendar";

interface Props {
	currentStreak: number;
	longestStreak: number;
}

export function Hero({ currentStreak, longestStreak }: Props) {
	// The month lives here rather than in the calendar because the pager sits in
	// the headline row while the grid it drives is a sibling below it.
	const [monthAnchor, setMonthAnchor] = useState(() => shiftMonth(Date.now(), 0));

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
				<MonthPager
					monthAnchor={monthAnchor}
					onStep={(delta) => setMonthAnchor((month) => shiftMonth(month, delta))}
				/>
			</div>

			<StreakCalendar monthAnchor={monthAnchor} />
		</motion.section>
	);
}
