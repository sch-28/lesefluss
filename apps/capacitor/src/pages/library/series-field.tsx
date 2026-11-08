import { BOOK_SERIES_INDEX_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Plus } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { nextSeriesNumber } from "../../components/collections/series-numbering";
import { EntryDialog } from "../../components/entry-dialog";
import { PickerTrigger } from "../../components/picker-trigger";
import type { ImportSeriesChoice } from "../../services/book-import";
import { collectionKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import type { DetectedSeries } from "../../services/series-collections";
import { Field } from "./book-edit-fields";

type Props = {
	choice: ImportSeriesChoice;
	onChange: (choice: ImportSeriesChoice) => void;
	collections: CollectionWithCount[];
	/** The series the import's file names. Adds it to the picker, with a status line, and
	 *  plain collections next to series, since the book can go anywhere instead. */
	detected?: DetectedSeries | null;
	/** The book being edited, left out of the numbers taken. */
	bookId?: string;
};

type Pick =
	| { kind: "detected" }
	| { kind: "collection"; collectionId: string }
	| { kind: "new"; name: string }
	| { kind: "none" };

/** "2.5" → 2.5, "" → null; anything else is not a series number. */
export function parseSeriesIndex(text: string): number | null | undefined {
	const trimmed = text.trim().replace(",", ".");
	if (!trimmed) return null;
	const n = Number(trimmed);
	return Number.isFinite(n) && n >= 0 && n <= BOOK_SERIES_INDEX_MAX ? n : undefined;
}

function indexTextOf(choice: ImportSeriesChoice): string {
	return choice.kind === "none" || choice.index === null ? "" : String(choice.index);
}

function formatSeries(name: string, index: number | null): string {
	return index === null ? name : `${name} #${index}`;
}

export const SeriesField: React.FC<Props> = ({
	choice,
	onChange,
	collections,
	detected,
	bookId,
}) => {
	const qc = useQueryClient();
	const [isPicking, setIsPicking] = useState(false);
	const [indexText, setIndexText] = useState(indexTextOf(choice));
	const latestChoice = useRef(choice);
	latestChoice.current = choice;

	// A series picked without a number gets the next free one, once its members are read.
	const fillNextNumber = async (collectionId: string) => {
		const members = await qc.fetchQuery({
			queryKey: collectionKeys.memberRows(collectionId),
			queryFn: () => queries.getCollectionMembers(collectionId),
		});
		const current = latestChoice.current;
		if (current.kind !== "collection" || current.collectionId !== collectionId) return;
		if (current.index !== null) return;
		const next = nextSeriesNumber(
			new Map(members.filter((m) => m.bookId !== bookId).map((m) => [m.bookId, m.seriesIndex])),
		);
		onChange({ ...current, index: next });
		setIndexText(String(next));
	};
	const picked =
		choice.kind === "collection" ? collections.find((c) => c.id === choice.collectionId) : null;
	const name =
		choice.kind === "detected"
			? (detected?.name ?? null)
			: choice.kind === "new"
				? choice.name
				: choice.kind === "collection"
					? (picked?.name ?? "Series")
					: null;
	// A plain collection has no reading order to number the book in.
	const hasIndex =
		choice.kind !== "none" && (choice.kind !== "collection" || picked?.ordered !== false);
	const isInvalid = hasIndex && parseSeriesIndex(indexText) === undefined;

	const pick = (next: Pick) => {
		const index = choice.kind === "none" ? null : choice.index;
		setIsPicking(false);
		if (next.kind === "none") {
			onChange({ kind: "none" });
			setIndexText("");
		} else if (next.kind === "detected") {
			const fileIndex = detected?.index ?? null;
			onChange({ kind: "detected", index: fileIndex });
			setIndexText(fileIndex === null ? "" : String(fileIndex));
		} else if (next.kind === "collection") {
			onChange({ kind: "collection", collectionId: next.collectionId, index });
			const isOrdered = collections.find((c) => c.id === next.collectionId)?.ordered;
			if (index === null && isOrdered) void fillNextNumber(next.collectionId);
		} else {
			const first = index ?? 1;
			onChange({ kind: "new", name: next.name, index: first });
			setIndexText(String(first));
		}
	};

	return (
		<Field label="Series" htmlFor="book-series-index">
			<div className="flex items-center gap-2">
				<PickerTrigger
					data-testid="series-picker"
					onClick={() => setIsPicking(true)}
					className="flex-1"
					value={name}
					placeholder={detected ? "Not in a series" : "No series"}
					trailing={
						choice.kind === "detected" && (
							<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
								from file
							</span>
						)
					}
				/>
				{hasIndex && (
					<div className="flex items-center gap-1">
						<span className="text-muted-foreground text-sm">#</span>
						<Input
							id="book-series-index"
							aria-label="Number in series"
							aria-invalid={isInvalid || undefined}
							inputMode="decimal"
							className="w-16"
							value={indexText}
							onBlur={() => setIndexText(indexTextOf(choice))}
							onChange={(e) => {
								setIndexText(e.target.value);
								const index = parseSeriesIndex(e.target.value);
								if (index !== undefined) onChange({ ...choice, index });
							}}
						/>
					</div>
				)}
			</div>
			{detected && <SeriesStatusLine detected={detected} isKept={choice.kind === "detected"} />}
			<SeriesPicker
				open={isPicking}
				onOpenChange={setIsPicking}
				collections={collections}
				choice={choice}
				detected={detected ?? null}
				onPick={pick}
			/>
		</Field>
	);
};

const SeriesStatusLine: React.FC<{ detected: DetectedSeries; isKept: boolean }> = ({
	detected,
	isKept,
}) => {
	const { status } = detected;
	const fileSays = <b className="font-medium">{formatSeries(detected.name, detected.index)}</b>;
	if (status.kind === "dismissed") {
		return (
			<p className="m-0 mt-1.5 text-muted-foreground text-sm">
				The file says {fileSays}, but you removed that series. It won't be added back.
			</p>
		);
	}
	if (!isKept) {
		return (
			<p className="m-0 mt-1.5 text-muted-foreground text-sm">
				The file says {fileSays}. This book stays out of that series, here and on your other
				devices.
			</p>
		);
	}
	if (status.kind === "waits") {
		return (
			<p className="m-0 mt-1.5 flex items-center gap-1.5 text-muted-foreground text-sm">
				<Clock className="size-3.5 shrink-0" />
				Becomes a series once a 2nd book of it is added
			</p>
		);
	}
	return (
		<p className="m-0 mt-1.5 flex items-center gap-1.5 text-emerald-700 text-sm dark:text-emerald-500">
			{status.kind === "joins" ? (
				<>
					<Check className="size-3.5 shrink-0" />
					<span>
						Joins your series <b className="font-medium">{status.name}</b> ({status.bookCount}{" "}
						{status.bookCount === 1 ? "book" : "books"})
					</span>
				</>
			) : (
				<>
					<Plus className="size-3.5 shrink-0" />
					<span>
						Starts the series <b className="font-medium">{detected.name}</b> with "
						{status.withTitle}"
					</span>
				</>
			)}
		</p>
	);
};

const SeriesPicker: React.FC<{
	open: boolean;
	onOpenChange: (open: boolean) => void;
	collections: CollectionWithCount[];
	choice: ImportSeriesChoice;
	detected: DetectedSeries | null;
	onPick: (next: Pick) => void;
}> = ({ open, onOpenChange, collections, choice, detected, onPick }) => {
	const [newName, setNewName] = useState("");
	// The file's series sits in its own group on top, so it is never offered twice.
	const offersDetected = detected !== null && detected.status.kind !== "dismissed";
	const series = useMemo(
		() =>
			collections
				.filter((c) => c.seriesKey !== null && !(offersDetected && c.id === detected?.collectionId))
				.sort((a, b) => a.sortOrder - b.sortOrder),
		[collections, offersDetected, detected],
	);
	const plain = useMemo(
		() => (detected ? collections.filter((c) => c.seriesKey === null) : []),
		[collections, detected],
	);
	const selectedId = choice.kind === "collection" ? choice.collectionId : null;
	const countHint = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;

	return (
		<EntryDialog open={open} onOpenChange={onOpenChange} title="Series">
			<div className="-mx-2 flex max-h-[45vh] flex-col overflow-y-auto">
				<PickRow
					label="No series"
					selected={choice.kind === "none"}
					onSelect={() => onPick({ kind: "none" })}
				/>
				{offersDetected && detected && (
					<>
						<GroupLabel>From the file</GroupLabel>
						<PickRow
							label={formatSeries(detected.name, detected.index)}
							hint={
								detected.status.kind === "joins" ? countHint(detected.status.bookCount) : "detected"
							}
							selected={choice.kind === "detected"}
							onSelect={() => onPick({ kind: "detected" })}
						/>
					</>
				)}
				{detected && series.length > 0 && <GroupLabel>Your series</GroupLabel>}
				{series.map((c) => (
					<PickRow
						key={c.id}
						label={c.name}
						hint={countHint(c.bookCount)}
						selected={c.id === selectedId}
						onSelect={() => onPick({ kind: "collection", collectionId: c.id })}
					/>
				))}
				{plain.length > 0 && <GroupLabel>Collections</GroupLabel>}
				{plain.map((c) => (
					<PickRow
						key={c.id}
						label={c.name}
						hint={countHint(c.bookCount)}
						selected={c.id === selectedId}
						onSelect={() => onPick({ kind: "collection", collectionId: c.id })}
					/>
				))}
			</div>
			<form
				className="flex items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const name = newName.trim();
					if (!name) return;
					onPick({ kind: "new", name });
					setNewName("");
				}}
			>
				<Input
					aria-label="New series name"
					placeholder="New series…"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
				/>
				<Button type="submit" variant="secondary" disabled={!newName.trim()}>
					<Plus />
					Create
				</Button>
			</form>
			{offersDetected && detected && (
				<p className="m-0 text-muted-foreground text-xs">
					Picking another one or No series keeps this book out of {detected.name}, here and on your
					other devices.
				</p>
			)}
		</EntryDialog>
	);
};

const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<p className="m-0 px-2 pt-3 pb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
		{children}
	</p>
);

const PickRow: React.FC<{
	label: string;
	hint?: string;
	selected: boolean;
	onSelect: () => void;
}> = ({ label, hint, selected, onSelect }) => (
	<button
		type="button"
		onClick={onSelect}
		aria-pressed={selected}
		className="flex h-11 items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted"
	>
		<span className="min-w-0 flex-1 truncate">{label}</span>
		{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		{selected && <Check className="size-4 text-primary" />}
	</button>
);
