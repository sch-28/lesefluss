import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import CoverImage from "../../components/cover-image";
import { formatRelative } from "../../utils/date-utils";
import {
	countLabel,
	filterSeriesEntries,
	progressLabel,
	type SeriesEntry,
	type SeriesKindFilter,
	type SeriesSort,
	seriesEntryKey,
} from "./series-nav";

const KIND_OPTIONS: { value: SeriesKindFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "book", label: "Book series" },
	{ value: "serial", label: "Serials" },
];

const SORT_OPTIONS: { value: SeriesSort; label: string }[] = [
	{ value: "last-read", label: "Last read" },
	{ value: "name", label: "A–Z" },
	{ value: "size", label: "Size" },
];

function Segment<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<fieldset
			aria-label={label}
			className="m-0 inline-flex min-w-0 shrink-0 overflow-hidden rounded-lg border border-border p-0"
		>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={value === o.value}
					onClick={() => onChange(o.value)}
					className={cn(
						"whitespace-nowrap px-3 py-1 text-sm transition-colors",
						value === o.value
							? "bg-muted text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{o.label}
				</button>
			))}
		</fieldset>
	);
}

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
	/** Phone sheet: the controls wrap and the rows scroll inside it. */
	compact?: boolean;
};

/** Every series with a search, a kind filter and a sort; a row opens its page. */
export function AllSeriesList({ entries, covers, onPick, onExit, autoFocus, compact }: Props) {
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<SeriesKindFilter>("all");
	const [sort, setSort] = useState<SeriesSort>("last-read");
	const listRef = useRef<HTMLUListElement>(null);
	const shown = useMemo(
		() => filterSeriesEntries(entries, { query, kind, sort }),
		[entries, query, kind, sort],
	);
	const now = Date.now();

	const rowButtons = () => [
		...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-series-row]") ?? []),
	];

	const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && shown[0]) {
			e.preventDefault();
			onPick(shown[0]);
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
			e.currentTarget.closest("[data-all-series]")?.querySelector("input")?.focus();
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
		const at = rows.indexOf(e.currentTarget);
		const next = at + (e.key === "ArrowDown" ? 1 : -1);
		if (next < 0) e.currentTarget.closest("[data-all-series]")?.querySelector("input")?.focus();
		else rows[next]?.focus();
	};

	return (
		<div data-all-series className={cn("flex min-h-0 flex-col", compact && "h-full")}>
			<div className={cn("flex flex-wrap items-center gap-2", compact ? "px-4" : "mb-3")}>
				<Segment label="Kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
				<Segment label="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />
			</div>
			<div className={cn("relative", compact ? "px-4 py-3" : "mb-3")}>
				<Input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={onSearchKey}
					placeholder="Search series"
					aria-label="Search series"
					autoFocus={autoFocus}
					className="pr-20"
				/>
				<span
					className={cn(
						"pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground text-xs tabular-nums",
						compact ? "right-6" : "right-2",
					)}
					data-testid="all-series-count"
				>
					{shown.length === entries.length
						? entries.length
						: `${shown.length} of ${entries.length}`}
				</span>
			</div>
			{shown.length === 0 ? (
				<p className="m-0 p-6 text-center text-muted-foreground text-sm">No series match.</p>
			) : (
				<ul
					ref={listRef}
					aria-label="Series"
					className={cn(
						"m-0 list-none p-0",
						compact ? "min-h-0 flex-1 overflow-y-auto" : "rounded-lg border border-border",
					)}
				>
					{shown.map((entry) => (
						<li key={seriesEntryKey(entry)} className="border-border border-b last:border-b-0">
							<button
								type="button"
								data-series-row
								onClick={() => onPick(entry)}
								onKeyDown={onRowKey}
								className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
							>
								<CoverStack entry={entry} covers={covers} />
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">
										{entry.kind === "serial" && (
											<span aria-hidden className="mr-1 text-muted-foreground">
												≋
											</span>
										)}
										{entry.name}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{[
											entry.author,
											entry.kind === "serial" && "serial",
											entry.lastRead === null
												? "not started"
												: `read ${formatRelative(entry.lastRead, now)}`,
										]
											.filter(Boolean)
											.join(" · ")}
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
								{!compact && (
									<span className="w-24 shrink-0 text-right text-muted-foreground text-xs">
										{progressLabel(entry)}
									</span>
								)}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
