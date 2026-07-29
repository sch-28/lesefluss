import { motion } from "framer-motion";
import type { DailyMinutes } from "../../../services/stats/aggregate";
import { AnimatedNumber } from "./animated-number";

interface Props {
	currentStreak: number;
	longestStreak: number;
	/** Oldest → newest. Only the tail is drawn; the full 90 days live in Activity. */
	last90Days: DailyMinutes[];
}

const DOT_DAYS = 7;

/** Single letter per weekday, indexed by `Date.getDay()`. */
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function Hero({ currentStreak, longestStreak, last90Days }: Props) {
	const recent = last90Days.slice(-DOT_DAYS);

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5 }}
			className="mx-4 mt-3 mb-6 rounded-2xl border border-current/10 bg-card p-5 text-card-foreground"
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-[11px] uppercase tracking-[0.18em] opacity-60">Reading streak</p>
					<div className="mt-1.5 flex items-baseline gap-2">
						<AnimatedNumber
							value={currentStreak}
							className="font-bold text-5xl tabular-nums leading-none tracking-tight"
						/>
						<span className="text-base opacity-70">{currentStreak === 1 ? "day" : "days"}</span>
					</div>
				</div>
				<span className="shrink-0 rounded-full bg-current/10 px-3 py-1 font-medium text-xs">
					🔥 Best {longestStreak} {longestStreak === 1 ? "day" : "days"}
				</span>
			</div>

			{recent.length > 0 && (
				<div className="mt-5 flex items-end justify-between gap-1">
					{recent.map((day, i) => {
						const hasRead = day.minutes > 0;
						return (
							<div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
								<motion.span
									initial={{ scale: 0.4, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									transition={{ duration: 0.3, delay: 0.1 + i * 0.04 }}
									className={`size-2.5 rounded-full ${hasRead ? "bg-emerald-500" : "bg-current/15"}`}
									title={`${day.date}: ${day.minutes} min`}
								/>
								<span className="text-[10px] opacity-45">
									{WEEKDAY_INITIALS[new Date(day.dayStart).getDay()]}
								</span>
							</div>
						);
					})}
				</div>
			)}
		</motion.section>
	);
}
