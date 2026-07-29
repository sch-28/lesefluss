import { CheckCircle2 } from "lucide-react";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { buildJourney } from "../../services/stats/journey";
import { formatDuration, formatShortDate } from "../../utils/date-utils";

/**
 * How this book went: when it arrived, when it was started, how long it took.
 *
 * Every value is a timestamp the app already records; nothing here needed a new
 * column. Hidden until the book has actually been opened, since "Added" alone
 * is not a journey.
 */
export function BookJourney({ book }: { book: Book }) {
	// Same query key as the stats card above it, so this shares one fetch.
	const stats = queryHooks.useStatsBook(book.id);
	const data = stats.data;
	if (!data) return null;

	const journey = buildJourney({
		addedAt: book.addedAt,
		finishedAt: book.finishedAt,
		firstReadAt: data.firstReadAt,
		lastReadAt: data.lastReadAt,
	});
	if (journey.milestones.length < 2) return null;

	const { sessionCount, longestSessionMs, longestSessionAt } = data;

	return (
		<section className="book-detail-card mt-4">
			<h2 className="book-detail-section-title">Your journey</h2>

			<ol className="mt-4 flex items-start justify-between gap-2">
				{journey.milestones.map((milestone, index) => {
					const isLast = index === journey.milestones.length - 1;
					const isFinish = isLast && journey.isFinished;
					return (
						<li key={milestone.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
							<div className="flex w-full items-center">
								{/* Connectors are drawn as half-segments either side of the dot so
								    the line meets it rather than running underneath. */}
								<span
									className={`h-px flex-1 ${index === 0 ? "bg-transparent" : "bg-current/20"}`}
								/>
								{isFinish ? (
									<CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
								) : (
									<span
										className={`size-2 shrink-0 rounded-full ${
											index === 0 ? "bg-current/30" : "bg-primary"
										}`}
									/>
								)}
								<span className={`h-px flex-1 ${isLast ? "bg-transparent" : "bg-current/20"}`} />
							</div>
							<span className="text-[10px] uppercase tracking-wide opacity-55">
								{milestone.label}
							</span>
							<span className="text-xs tabular-nums">{formatShortDate(milestone.at)}</span>
						</li>
					);
				})}
			</ol>

			<p className="mt-4 border-current/10 border-t pt-3 text-xs opacity-70">
				{journey.spanDays !== null && (
					<>
						{sessionCount} {sessionCount === 1 ? "sitting" : "sittings"} across {journey.spanDays}{" "}
						{journey.spanDays === 1 ? "day" : "days"}
					</>
				)}
				{longestSessionAt != null && longestSessionMs > 0 && (
					<>
						{" · longest "}
						{formatDuration(longestSessionMs)} on {formatShortDate(longestSessionAt)}
					</>
				)}
			</p>
		</section>
	);
}
