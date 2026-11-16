import { Button } from "@lesefluss/ui/button";
import { Input, InputHitArea } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import { ChevronDown } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { Section } from "../../components/app-shell/section";
import CoverImage from "../../components/cover-image";
import { ReservedCard } from "../../components/reserved-card";
import SelectionPopover from "../../components/selection-popover";
import { formatRelative } from "../../utils/date-utils";
import {
	countLabel,
	filterSeriesEntries,
	groupSeriesEntries,
	progressLabel,
	type SeriesEntry,
	type SeriesSort,
	seriesEntryKey,
} from "./series-nav";

const SORT_OPTIONS: readonly SeriesSort[] = ["last-read", "name", "size"];
const SORT_LABELS: Record<SeriesSort, string> = {
	"last-read": "Last read",
	name: "A–Z",
	size: "Size",
};

function CoverStack({
	entry,
	covers,
}: {
	entry: SeriesEntry;
	covers: ReadonlyMap<string, string>;
}) {
	const srcs =
		entry.kind === "serial"
			? [entry.coverImage]
			: entry.coverBookIds.length > 0
				? entry.coverBookIds.map((id) => covers.get(id) ?? null)
				: [null];
	return (
		<span className="flex w-16 shrink-0" aria-hidden>
			{srcs.map((src, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: covers repeat and never reorder
					key={i}
					className="-mr-4 block aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-sm border border-background bg-muted"
				>
					<CoverImage src={src} alt="" fallback={<span />} />
				</span>
			))}
		</span>
	);
}

type Props = {
	entries: readonly SeriesEntry[];
	covers: ReadonlyMap<string, string>;
	onPick: (entry: SeriesEntry) => void;
	/** Esc on an empty search: the caller leaves the list. */
	onExit?: () => void;
	autoFocus?: boolean;
	/** Holds the list's place with a spinner below the working controls. */
	isPending?: boolean;
};

function SeriesRow({
	entry,
	covers,
	now,
	onPick,
	onKeyDown,
}: {
	entry: SeriesEntry;
	covers: ReadonlyMap<string, string>;
	now: number;
	onPick: (entry: SeriesEntry) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
	return (
		<li className="border-border border-b last:border-b-0">
			<button
				type="button"
				data-series-row
				onClick={() => onPick(entry)}
				onKeyDown={onKeyDown}
				className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
			>
				<CoverStack entry={entry} covers={covers} />
				<span className="min-w-0 flex-1">
					<span className="block break-words font-medium">{entry.name}</span>
					<span className="block truncate text-muted-foreground text-xs">
						{/* No "not started": the progress label already says "New". */}
						{[
							entry.author,
							entry.lastRead !== null && `read ${formatRelative(entry.lastRead, now)}`,
						]
							.filter(Boolean)
							.join(" · ")}
						<span className="sm:hidden"> · {progressLabel(entry)}</span>
					</span>
				</span>
				<span
					className={cn(
						"shrink-0 rounded-full border px-2 py-0.5 text-xs",
						entry.kind === "serial"
							? "border-emerald-400/45 text-emerald-500"
							: "border-border text-muted-foreground",
					)}
				>
					{countLabel(entry)}
				</span>
				<span className="hidden w-24 shrink-0 text-right text-muted-foreground text-xs sm:block">
					{progressLabel(entry)}
				</span>
			</button>
		</li>
	);
}

/** Every series, grouped into book series and serials, with a search and a sort; a row opens its page. */
export function AllSeriesList({ entries, covers, onPick, onExit, autoFocus, isPending }: Props) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<SeriesSort>("last-read");
	const rootRef = useRef<HTMLDivElement>(null);
	const groups = useMemo(
		() => groupSeriesEntries(filterSeriesEntries(entries, { query, sort })),
		[entries, query, sort],
	);
	const shownCount = groups.reduce((n, g) => n + g.entries.length, 0);
	const now = Date.now();

	const rowButtons = () => [
		...(rootRef.current?.querySelectorAll<HTMLButtonElement>("button[data-series-row]") ?? []),
	];
	const focusSearch = () => rootRef.current?.querySelector("input")?.focus();

	const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const first = groups[0]?.entries[0];
		if (e.key === "Enter" && first) {
			e.preventDefault();
			onPick(first);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			rowButtons()[0]?.focus();
		} else if (e.key === "Escape" && query !== "") {
			e.preventDefault();
			e.stopPropagation();
			setQuery("");
		} else if (e.key === "Escape" && onExit) {
			e.preventDefault();
			onExit();
		}
	};

	const onRowKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === "Escape" && query !== "") {
			e.preventDefault();
			setQuery("");
			focusSearch();
			return;
		}
		if (e.key === "Escape" && onExit) {
			e.preventDefault();
			onExit();
			return;
		}
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
		e.preventDefault();
		const rows = rowButtons();
		const next = rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1);
		if (next < 0) focusSearch();
		else rows[next]?.focus();
	};

	return (
		<div ref={rootRef} className="flex min-h-0 flex-col">
			<div className="mb-4 flex items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<InputHitArea>
						<Input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={onSearchKey}
							placeholder="Search series"
							aria-label="Search series"
							autoFocus={autoFocus}
							className="pr-16"
						/>
					</InputHitArea>
					<span
						className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground text-xs tabular-nums"
						data-testid="all-series-count"
					>
						{/* The page summary already gives the total; this counts only a filtered list. */}
						{isPending || shownCount === entries.length
							? null
							: `${shownCount} of ${entries.length}`}
					</span>
				</div>
				<SelectionPopover
					trigger={
						<Button
							variant="outline"
							// min-w holds the row still when the label changes; the ::before stretches the 32px button's touch target to 44px, keeping the look.
							className="relative min-w-26 justify-between before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']"
						>
							<span className="sr-only">Sort: </span>
							{SORT_LABELS[sort]}
							<ChevronDown data-icon="inline-end" aria-hidden />
						</Button>
					}
					sections={[
						{
							heading: "Sort by",
							options: SORT_OPTIONS,
							labels: SORT_LABELS,
							selected: sort,
							onSelect: setSort,
						},
					]}
				/>
			</div>
			{isPending ? (
				<ReservedCard isPending height="50vh" />
			) : groups.length === 0 ? (
				<p className="m-0 p-6 text-center text-muted-foreground text-sm">No series match.</p>
			) : (
				<div>
					{groups.map((group) => (
						<Section
							key={group.kind}
							title={group.label}
							action={
								<span className="text-muted-foreground text-xs tabular-nums">
									{group.entries.length}
								</span>
							}
						>
							<ul aria-label={group.label} className="m-0 list-none p-0">
								{group.entries.map((entry) => (
									<SeriesRow
										key={seriesEntryKey(entry)}
										entry={entry}
										covers={covers}
										now={now}
										onPick={onPick}
										onKeyDown={onRowKey}
									/>
								))}
							</ul>
						</Section>
					))}
				</div>
			)}
		</div>
	);
}
