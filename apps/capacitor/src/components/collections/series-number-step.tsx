import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useMemo, useState } from "react";
import type { Book } from "../../services/db/schema";
import {
	formatSeriesNumber,
	highestNumber,
	type NumberingMode,
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

/** The Set #N step of the collection sheet: a preview of every book's number before Apply. */
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
	const numbers = useMemo(
		() =>
			planSeriesNumbers(
				books.map((b) => b.id),
				members,
				mode,
			),
		[books, members, mode],
	);
	const labels: Record<NumberingMode, string> = {
		append: highest > 0 ? `After ${formatSeriesNumber(highest)}` : "In view order",
		fromOne: `Number 1..${books.length}`,
		clear: "Clear #N",
	};

	return (
		<div className="flex min-h-0 flex-col" data-testid="series-number-step">
			<fieldset className="m-0 flex flex-wrap gap-2 border-0 px-4 pt-0 pb-3" aria-label="Numbering">
				{MODES.map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={mode === m}
						onClick={() => setMode(m)}
						className={cn(
							"rounded-full border px-3 py-1 text-sm transition-colors",
							mode === m
								? "border-primary bg-primary text-primary-foreground"
								: "border-border hover:bg-muted",
						)}
					>
						{labels[m]}
					</button>
				))}
			</fieldset>
			<ol className="m-0 max-h-[45vh] list-none overflow-y-auto px-4 pb-2" aria-label={name}>
				{books.map((book) => {
					const index = numbers.get(book.id) ?? null;
					return (
						<li
							key={book.id}
							data-testid="series-number-row"
							className="flex items-center gap-3 border-border border-b py-2 last:border-b-0"
						>
							<span className="w-12 shrink-0 font-medium text-sm tabular-nums">
								{index === null ? "–" : formatSeriesNumber(index)}
							</span>
							<span className="min-w-0 flex-1 truncate text-sm">{book.title}</span>
							{members.has(book.id) && (
								<span className="shrink-0 text-muted-foreground text-xs">Already in</span>
							)}
						</li>
					);
				})}
			</ol>
			<div className="flex justify-end gap-2 border-border border-t p-4">
				{onRemove && (
					<Button variant="ghost" className="mr-auto" onClick={onRemove} disabled={isApplying}>
						Remove from {name}
					</Button>
				)}
				<Button variant="outline" onClick={onBack} disabled={isApplying}>
					Back
				</Button>
				<Button onClick={() => onApply(numbers)} disabled={isApplying || books.length === 0}>
					Apply
				</Button>
			</div>
		</div>
	);
};
