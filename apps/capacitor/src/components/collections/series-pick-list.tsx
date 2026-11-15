import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import { Check, Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { CollectionWithCount } from "../../services/db/queries/collections";

export type SeriesPick =
	| { kind: "detected" }
	| { kind: "collection"; collectionId: string }
	| { kind: "new"; name: string }
	| { kind: "none" };

export type SeriesPickSelection =
	| { kind: "none" }
	| { kind: "detected" }
	| { kind: "collection"; collectionId: string }
	| null;

type Props = {
	series: readonly CollectionWithCount[];
	selected: SeriesPickSelection;
	onPick: (pick: SeriesPick) => void;
	/** Above the series: the file's own series, from the import. */
	top?: React.ReactNode;
	/** Below the series: plain collections the import may also pick. */
	bottom?: React.ReactNode;
	/** A row's hint in place of its book count, e.g. "On 2 of 3" for a selection. */
	hintOf?: (collection: CollectionWithCount) => string;
	className?: string;
};

export const seriesCountHint = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;

/** The one series picker: Edit's series field and the card menu's Add to series… both show it. */
export const SeriesPickList: React.FC<Props> = ({
	series,
	selected,
	onPick,
	top,
	bottom,
	hintOf,
	className,
}) => {
	const [newName, setNewName] = useState("");
	const selectedId = selected?.kind === "collection" ? selected.collectionId : null;
	return (
		<div className={cn("flex flex-col gap-3", className)} data-testid="series-pick-list">
			<div className="-mx-2 flex max-h-[45vh] flex-col overflow-y-auto">
				<PickRow
					label="No series"
					selected={selected?.kind === "none"}
					onSelect={() => onPick({ kind: "none" })}
				/>
				{top}
				{series.map((c) => (
					<PickRow
						key={c.id}
						label={c.name}
						hint={hintOf?.(c) ?? seriesCountHint(c.bookCount)}
						selected={c.id === selectedId}
						onSelect={() => onPick({ kind: "collection", collectionId: c.id })}
					/>
				))}
				{bottom}
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
		</div>
	);
};

export const PickGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<p className="m-0 px-2 pt-3 pb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
		{children}
	</p>
);

export const PickRow: React.FC<{
	label: string;
	hint?: string;
	selected: boolean;
	onSelect: () => void;
}> = ({ label, hint, selected, onSelect }) => (
	<button
		type="button"
		onClick={onSelect}
		aria-pressed={selected}
		data-testid="series-pick-row"
		className="flex h-11 items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted"
	>
		<span className="min-w-0 flex-1 truncate">{label}</span>
		{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		{selected && <Check className="size-4 text-primary" />}
	</button>
);
