import { BOOK_SERIES_INDEX_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { Check, ChevronRight, Plus } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { EntryDialog } from "../../components/entry-dialog";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { Field } from "./book-edit-fields";
import type { SeriesChoice } from "./book-edit-form";

type Props = {
	choice: SeriesChoice;
	onChange: (choice: SeriesChoice) => void;
	collections: CollectionWithCount[];
};

/** "2.5" → 2.5, "" → null; anything else is not a series number. */
export function parseSeriesIndex(text: string): number | null | undefined {
	const trimmed = text.trim().replace(",", ".");
	if (!trimmed) return null;
	const n = Number(trimmed);
	return Number.isFinite(n) && n >= 0 && n <= BOOK_SERIES_INDEX_MAX ? n : undefined;
}

function indexTextOf(choice: SeriesChoice): string {
	return choice.kind === "none" || choice.index === null ? "" : String(choice.index);
}

export const SeriesField: React.FC<Props> = ({ choice, onChange, collections }) => {
	const [isPicking, setIsPicking] = useState(false);
	const [indexText, setIndexText] = useState(indexTextOf(choice));
	const name =
		choice.kind === "new"
			? choice.name
			: choice.kind === "collection"
				? (collections.find((c) => c.id === choice.collectionId)?.name ?? "Series")
				: null;
	const isInvalid = choice.kind !== "none" && parseSeriesIndex(indexText) === undefined;

	return (
		<Field label="Series" htmlFor="book-series-index">
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => setIsPicking(true)}
					className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-2.5 text-left text-base md:text-sm dark:bg-input/30"
				>
					<span className={name ? "min-w-0 flex-1 truncate" : "flex-1 text-muted-foreground"}>
						{name ?? "No series"}
					</span>
					<span className="flex items-center text-muted-foreground text-xs">
						{name ? "Change" : "Add"}
						<ChevronRight className="size-4" />
					</span>
				</button>
				{choice.kind !== "none" && (
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
			<SeriesPicker
				open={isPicking}
				onOpenChange={setIsPicking}
				collections={collections}
				choice={choice}
				onPick={(next) => {
					const index = choice.kind === "none" ? null : choice.index;
					setIsPicking(false);
					if (next === null) {
						onChange({ kind: "none" });
						setIndexText("");
					} else if (typeof next === "string") {
						onChange({ kind: "collection", collectionId: next, index });
					} else {
						onChange({ kind: "new", name: next.name, index });
					}
				}}
			/>
		</Field>
	);
};

const SeriesPicker: React.FC<{
	open: boolean;
	onOpenChange: (open: boolean) => void;
	collections: CollectionWithCount[];
	choice: SeriesChoice;
	onPick: (next: string | { name: string } | null) => void;
}> = ({ open, onOpenChange, collections, choice, onPick }) => {
	const [newName, setNewName] = useState("");
	// Imported series before hand-made ordered collections, the order the
	// membership query reads them back in.
	const series = useMemo(
		() =>
			collections
				.filter((c) => c.ordered)
				.sort((a, b) => Number(!a.seriesKey) - Number(!b.seriesKey) || a.sortOrder - b.sortOrder),
		[collections],
	);
	const selectedId = choice.kind === "collection" ? choice.collectionId : null;

	return (
		<EntryDialog open={open} onOpenChange={onOpenChange} title="Series">
			<div className="-mx-2 flex max-h-[45vh] flex-col overflow-y-auto">
				<PickRow
					label="No series"
					selected={choice.kind === "none"}
					onSelect={() => onPick(null)}
				/>
				{series.map((c) => (
					<PickRow
						key={c.id}
						label={c.name}
						hint={`${c.bookCount} ${c.bookCount === 1 ? "book" : "books"}`}
						selected={c.id === selectedId}
						onSelect={() => onPick(c.id)}
					/>
				))}
			</div>
			<form
				className="flex items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const name = newName.trim();
					if (!name) return;
					onPick({ name });
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
		</EntryDialog>
	);
};

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
