import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useId, useMemo, useState } from "react";
import { chipsOf, type LibraryFilter, removeValue, setWordRange } from "./filter-model";
import type { FacetOptions } from "./filter-picker";
import { commitQuery, pickSuggestion, type Suggestion, suggestionsFor } from "./query-syntax";

type Props = {
	value: string;
	onValueChange: (value: string) => void;
	filter: LibraryFilter;
	onFilterChange: (filter: LibraryFilter) => void;
	options: FacetOptions;
};

/** The chip shown last: Length, else the last facet chip. */
function withoutLastChip(filter: LibraryFilter): LibraryFilter {
	if (filter.words) return setWordRange(filter, null);
	const last = chipsOf(filter).at(-1);
	return last ? removeValue(filter, last.facet, last.value) : filter;
}

/** The library search box: `field:value` tokens turn into chips, the rest searches title and author. */
export const SearchAutocomplete: React.FC<Props> = ({
	value,
	onValueChange,
	filter,
	onFilterChange,
	options,
}) => {
	const listId = useId();
	const [active, setActive] = useState(-1);
	const [dismissed, setDismissed] = useState(false);
	const suggestions = useMemo(
		() => (dismissed ? [] : suggestionsFor(value, options)),
		[dismissed, value, options],
	);

	const commit = (input: string, all: boolean) => {
		const result = commitQuery(input, filter, options, all);
		if (!result) {
			onValueChange(input);
			return;
		}
		onFilterChange(result.filter);
		onValueChange(result.input);
	};

	const pick = (s: Suggestion) => {
		const next = pickSuggestion(value, s);
		setActive(-1);
		// A field name waits for its value; a value finishes the token.
		if (next.endsWith(":")) onValueChange(next);
		else commit(next, true);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown" && suggestions.length > 0) {
			e.preventDefault();
			setActive((i) => (i + 1) % suggestions.length);
		} else if (e.key === "ArrowUp" && suggestions.length > 0) {
			e.preventDefault();
			setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const s = suggestions[active];
			if (s) pick(s);
			else commit(value, true);
		} else if (e.key === "Backspace" && value === "") {
			const next = withoutLastChip(filter);
			if (next !== filter) onFilterChange(next);
		} else if (e.key === "Escape" && suggestions.length > 0) {
			e.stopPropagation();
			setDismissed(true);
		}
	};

	return (
		<div className="relative">
			<Input
				autoFocus
				value={value}
				placeholder="Search, or tag: status: rating:>=4 in: words:<50k"
				aria-label="Search library"
				role="combobox"
				aria-expanded={suggestions.length > 0}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
				onChange={(e) => {
					setActive(-1);
					setDismissed(false);
					const next = e.target.value;
					if (/\s$/.test(next)) commit(next, false);
					else onValueChange(next);
				}}
				onKeyDown={handleKeyDown}
				onBlur={() => setDismissed(true)}
				onFocus={() => setDismissed(false)}
			/>
			{suggestions.length > 0 && (
				<div
					id={listId}
					role="listbox"
					aria-label="Suggestions"
					data-testid="search-suggestions"
					className="absolute inset-x-0 top-full z-30 mt-1 flex gap-1.5 overflow-x-auto rounded-md border border-border bg-popover p-1.5 shadow-md md:flex-col md:gap-0 md:overflow-visible"
				>
					{suggestions.map((s, i) => (
						<button
							key={s.insert}
							id={`${listId}-${i}`}
							type="button"
							role="option"
							aria-selected={i === active}
							tabIndex={-1}
							// Keeps focus in the input, so the blur does not close the list first.
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(s)}
							className={cn(
								"flex shrink-0 items-center justify-between gap-3 rounded-full border border-border px-3 py-1 text-left text-sm md:rounded-sm md:border-0 md:px-2",
								i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
							)}
						>
							<span className="truncate">{s.label}</span>
							{s.detail && <span className="text-muted-foreground text-xs">{s.detail}</span>}
						</button>
					))}
				</div>
			)}
		</div>
	);
};
