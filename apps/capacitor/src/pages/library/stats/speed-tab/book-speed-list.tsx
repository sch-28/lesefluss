import type { MeasuredReadingMode, SpeedModel } from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { useState } from "react";
import CoverImage from "../../../../components/cover-image";
import { queryHooks } from "../../../../services/db/hooks";
import {
	type BookSort,
	modeAverage,
	percentVsAverage,
	sortBookRows,
} from "../../../../services/stats/speed-tab";
import { formatDuration } from "../../../../utils/date-utils";
import { TitleCover } from "../title-cover";

export const BOOK_LIST_PREVIEW = 7;

const MODE_BADGE: Record<MeasuredReadingMode, string> = {
	rsvp: "RSVP",
	page: "PAGE",
	scroll: "SCROLL",
};

const SORT_LABELS: Record<BookSort, string> = { wpm: "wpm", delta: "± avg", recent: "Recent" };

function DeltaBar({ percent }: { percent: number }) {
	// ±50% fills the half-bar; past that it is clipped rather than rescaled.
	const width = Math.min(50, Math.abs(percent));
	return (
		<span className="flex items-center gap-1.5">
			<span
				className="relative h-1.5 w-12 overflow-hidden rounded-full bg-current/10"
				aria-hidden="true"
			>
				<span
					className={cn(
						"absolute top-0 h-full",
						percent >= 0 ? "left-1/2 bg-foreground/50" : "right-1/2 bg-foreground/50",
					)}
					style={{ width: `${width}%` }}
				/>
			</span>
			<span className={cn("w-9 text-right text-[0.6875rem] text-muted-foreground tabular-nums")}>
				{percent > 0 ? `+${percent}` : percent < 0 ? `−${Math.abs(percent)}` : "±0"}%
			</span>
		</span>
	);
}

export function BookSpeedList({ model }: { model: SpeedModel }) {
	const { data } = queryHooks.useStatsSpeedTab();
	const [sort, setSort] = useState<BookSort>("wpm");
	const [showAll, setShowAll] = useState(false);
	const rows = data ? sortBookRows(data.books, sort, model) : [];
	if (rows.length === 0) return null;
	const visible = showAll ? rows : rows.slice(0, BOOK_LIST_PREVIEW);

	return (
		<section className="mb-8 px-4" data-testid="book-speed-list">
			<header className="mb-2 flex items-center justify-between gap-2">
				<h3 className="font-semibold text-base">Books</h3>
				<div className="flex gap-1" data-testid="book-sort">
					{(Object.keys(SORT_LABELS) as BookSort[]).map((s) => (
						<button
							key={s}
							type="button"
							aria-pressed={s === sort}
							onClick={() => setSort(s)}
							className={cn(
								"rounded-md px-2 py-0.5 text-xs",
								s === sort ? "bg-muted font-medium" : "text-muted-foreground",
							)}
						>
							{SORT_LABELS[s]}
						</button>
					))}
				</div>
			</header>
			<ul className="divide-y divide-border">
				{visible.map((row) => {
					const percent = percentVsAverage(row.wpm, modeAverage(model, row.mode));
					return (
						<li
							key={row.bookId}
							className="flex items-center gap-3 py-2"
							data-testid="book-speed-row"
						>
							<div className="h-12 w-8 flex-shrink-0 overflow-hidden rounded-sm bg-muted">
								<CoverImage
									src={row.coverImage}
									alt={row.title}
									fallback={<TitleCover title={row.title} />}
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="rounded-sm bg-muted px-1 font-semibold text-[0.5625rem] text-muted-foreground tracking-wide">
										{MODE_BADGE[row.mode]}
									</span>
									<span className="truncate text-sm">{row.title}</span>
								</div>
								<div className="text-[0.6875rem] text-muted-foreground tabular-nums">
									{formatDuration(row.activeMs)}
									{row.mode === "rsvp" && row.dialWpm !== null ? ` · avg dial ${row.dialWpm}` : ""}
								</div>
							</div>
							<div className="flex flex-col items-end gap-0.5">
								<span className="font-semibold text-sm tabular-nums">{row.wpm} wpm</span>
								{percent !== null && <DeltaBar percent={percent} />}
							</div>
						</li>
					);
				})}
			</ul>
			{!showAll && rows.length > BOOK_LIST_PREVIEW && (
				<button
					type="button"
					onClick={() => setShowAll(true)}
					className="mt-2 w-full rounded-md py-2 text-muted-foreground text-sm hover:bg-muted"
				>
					Show all {rows.length}
				</button>
			)}
		</section>
	);
}
