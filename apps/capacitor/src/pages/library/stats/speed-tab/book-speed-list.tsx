import {
	BOOK_SPEED_MIN_ACTIVE_MS,
	type MeasuredReadingMode,
	type SpeedModel,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { useState } from "react";
import CoverImage from "../../../../components/cover-image";
import { ReservedCard } from "../../../../components/reserved-card";
import { queryHooks } from "../../../../services/db/hooks";
import { type BookSort, sortBookRows } from "../../../../services/stats/speed-tab";
import { formatDuration } from "../../../../utils/date-utils";
import { STAT_ROW_HEIGHT, StatRow, StatsSection } from "../section-header";
import { TitleCover } from "../title-cover";

export const BOOK_LIST_PREVIEW = 4;
/** The header and a full preview. */
const PENDING_HEIGHT = 36 + BOOK_LIST_PREVIEW * STAT_ROW_HEIGHT;

const MODE_LABELS: Record<MeasuredReadingMode, string> = {
	rsvp: "RSVP",
	page: "Page",
	scroll: "Scroll",
};

const SORT_LABELS: Partial<Record<BookSort, string>> = { wpm: "Speed", recent: "Recent" };
const SORTS = Object.keys(SORT_LABELS) as BookSort[];

export function BookSpeedList({ model }: { model: SpeedModel }) {
	const { data, isPending } = queryHooks.useStatsSpeedTab();
	const [sort, setSort] = useState<BookSort>("wpm");
	const [showAll, setShowAll] = useState(false);
	if (isPending) return <ReservedCard isPending height={PENDING_HEIGHT} className="mt-6 px-4" />;
	const rows = data ? sortBookRows(data.books, sort, model) : [];
	const visible = showAll ? rows : rows.slice(0, BOOK_LIST_PREVIEW);
	const sortControl =
		rows.length > 1 ? (
			<SegmentedControl
				aria-label="Sort books"
				data-testid="book-sort"
				className="w-auto"
				value={sort}
				onValueChange={setSort}
				options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
			/>
		) : undefined;

	return (
		<StatsSection title="Books" aside={sortControl} data-testid="book-speed-list">
			{rows.length === 0 ? (
				<StatRow
					label={<span className="text-muted-foreground">Each book's speed shows here</span>}
					sub={`After ${BOOK_SPEED_MIN_ACTIVE_MS / 60_000} min of reading it`}
				/>
			) : (
				<div className="[&>*:last-child]:border-b-0">
					{visible.map((row) => (
						<StatRow
							key={row.bookId}
							data-testid="book-speed-row"
							icon={
								<div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
									<CoverImage
										src={row.coverImage}
										alt=""
										fallback={<TitleCover title={row.title} />}
									/>
								</div>
							}
							label={<span className="block truncate">{row.title}</span>}
							sub={
								<span className="flex min-w-0 items-center gap-2">
									<span className="inline-flex h-6 shrink-0 items-center rounded-full border border-border px-2 text-xs">
										{MODE_LABELS[row.mode]}
									</span>
									<span className="truncate">{row.author ?? formatDuration(row.activeMs)}</span>
								</span>
							}
							value={
								<>
									{row.wpm} <small className="font-normal text-muted-foreground text-xs">wpm</small>
								</>
							}
						/>
					))}
				</div>
			)}
			{!showAll && rows.length > BOOK_LIST_PREVIEW && (
				<div className="mt-2 flex justify-center">
					<Button variant="outline" className="h-11" onClick={() => setShowAll(true)}>
						Show all {rows.length} books
					</Button>
				</div>
			)}
		</StatsSection>
	);
}
