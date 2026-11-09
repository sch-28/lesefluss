import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useMemo, useState } from "react";
import type { Book } from "../../services/db/schema";
import {
	duplicateNumbers,
	formatSeriesNumber,
	highestNumber,
	type NumberingMode,
	parseSeriesNumber,
	planSeriesNumbers,
} from "./series-numbering";

type Props = {
	name: string;
	/** In view order, which `append` and `fromOne` number by. */
	books: readonly Book[];
	/** The collection's live members and their #N; empty for a new series. */
	members: ReadonlyMap<string, number | null>;
	isApplying: boolean;
	onBack: () => void;
	/** Takes the books that are in it out; absent when none are. */
	onRemove?: () => void;
	onApply: (numbers: Map<string, number | null>) => void;
};

const MODES: readonly NumberingMode[] = ["append", "fromOne", "clear"];

/** The Set #N step of the collection sheet: every book's number, editable, before Apply. */
export const SeriesNumberStep: React.FC<Props> = ({
	name,
	books,
	members,
	isApplying,
	onBack,
	onRemove,
	onApply,
}) => {
	const [mode, setMode] = useState<NumberingMode>("append");
	const highest = highestNumber(members);
	const planned = useMemo(
		() =>
			planSeriesNumbers(
				books.map((b) => b.id),
				members,
				mode,
			),
		[books, members, mode],
	);
	// Typed numbers win over the mode's plan until the mode changes.
	const [typed, setTyped] = useState<ReadonlyMap<string, string>>(new Map());
	const numbers = useMemo(() => {
		const merged = new Map(planned);
		for (const [id, text] of typed) {
			const parsed = parseSeriesNumber(text);
			if (parsed !== undefined) merged.set(id, parsed);
		}
		return merged;
	}, [planned, typed]);
	const invalid = [...typed.values()].some((text) => parseSeriesNumber(text) === undefined);
	const duplicates = duplicateNumbers(numbers, members);
	const labels: Record<NumberingMode, string> = {
		append: highest > 0 ? `After ${formatSeriesNumber(highest)}` : "In view order",
		fromOne: `Number 1..${books.length}`,
		clear: "Clear #N",
	};

	return (
		<div className="flex min-h-0 flex-col" data-testid="series-number-step">
			<div className="px-4 pt-0 pb-3">
				<SegmentedControl
					aria-label="Numbering"
					value={mode}
					onValueChange={(m) => {
						setMode(m);
						setTyped(new Map());
					}}
					options={MODES.map((m) => ({ value: m, label: labels[m] }))}
				/>
			</div>
			<ol className="m-0 max-h-[45vh] list-none overflow-y-auto px-4 pb-2" aria-label={name}>
				{books.map((book) => {
					const index = numbers.get(book.id) ?? null;
					const text = typed.get(book.id);
					const isBad =
						(text !== undefined && parseSeriesNumber(text) === undefined) ||
						(index !== null && duplicates.has(index));
					return (
						<li
							key={book.id}
							data-testid="series-number-row"
							className="flex items-center gap-3 border-border border-b py-2 last:border-b-0"
						>
							<Input
								value={text ?? (index === null ? "" : String(index))}
								placeholder="–"
								inputMode="decimal"
								aria-label={`Number of ${book.title}`}
								aria-invalid={isBad}
								onChange={(e) => {
									const next = new Map(typed);
									next.set(book.id, e.target.value);
									setTyped(next);
								}}
								className={cn(
									"h-8 w-16 shrink-0 px-2 font-medium text-sm tabular-nums",
									isBad && "border-destructive text-destructive",
								)}
							/>
							<span className="min-w-0 flex-1 truncate text-sm">{book.title}</span>
							{members.has(book.id) && (
								<span className="shrink-0 text-muted-foreground text-xs">Already in</span>
							)}
						</li>
					);
				})}
			</ol>
			{duplicates.size > 0 && (
				<p className="m-0 px-4 pb-2 text-destructive text-sm" role="alert">
					{[...duplicates].map(formatSeriesNumber).join(", ")} already taken in {name}
				</p>
			)}
			<div className="flex justify-end gap-2 border-border border-t p-4">
				{onRemove && (
					<Button variant="ghost" className="mr-auto" onClick={onRemove} disabled={isApplying}>
						Remove from {name}
					</Button>
				)}
				<Button variant="outline" onClick={onBack} disabled={isApplying}>
					Back
				</Button>
				<Button
					onClick={() => onApply(numbers)}
					disabled={isApplying || books.length === 0 || invalid || duplicates.size > 0}
				>
					Apply
				</Button>
			</div>
		</div>
	);
};
