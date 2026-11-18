import { Button } from "@lesefluss/ui/button";
import { SearchField as SearchFieldBase } from "@lesefluss/ui/search-field";
import { Clock, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	clearRecentSearches,
	readRecentSearches,
	recordRecentSearch,
	removeRecentSearch,
} from "./recent-searches";

// The catalog rejects longer queries.
const MAX_QUERY_LENGTH = 200;

type Props = {
	value: string;
	onChange: (value: string) => void;
	/** Commit a query right away (Enter or a recent pick), skipping the debounce. */
	onSubmit: (value: string) => void;
	label?: string;
	placeholder?: string;
	/** Off where the queries are not catalog searches, so they stay out of Explore's list. */
	hasRecents?: boolean;
};

const SearchField: React.FC<Props> = ({
	value,
	onChange,
	onSubmit,
	label = "Search books and web novels",
	placeholder = label,
	hasRecents = true,
}) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isFocused, setFocused] = useState(false);
	const [recent, setRecent] = useState<string[]>(readRecentSearches);
	const blurTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(blurTimerRef.current), []);

	const showRecent = hasRecents && isFocused && !value && recent.length > 0;

	const submit = (query: string) => {
		if (hasRecents) setRecent(recordRecentSearch(query));
		onSubmit(query);
		inputRef.current?.blur();
	};

	return (
		<SearchFieldBase
			ref={inputRef}
			maxLength={MAX_QUERY_LENGTH}
			aria-label={label}
			placeholder={placeholder}
			value={value}
			onValueChange={onChange}
			onClear={() => onSubmit("")}
			onFocus={() => {
				// A blur just before (pressing Clear) must not hide the list after this focus.
				clearTimeout(blurTimerRef.current);
				setRecent(readRecentSearches());
				setFocused(true);
			}}
			// Delay so a tap on a recent entry lands before the list unmounts.
			onBlur={() => {
				blurTimerRef.current = setTimeout(() => setFocused(false), 150);
			}}
			onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
				if (e.key === "Enter" && value.trim()) {
					e.preventDefault();
					submit(value);
				}
			}}
		>
			{showRecent && (
				<section
					aria-label="Recent searches"
					className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
				>
					<div className="flex items-center justify-between px-2 py-1 text-muted-foreground text-xs">
						<span>Recent searches</span>
						<button
							type="button"
							className="min-h-6 min-w-6 border-0 bg-transparent px-2 text-xs underline-offset-2 hover:underline"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => {
								clearRecentSearches();
								setRecent([]);
							}}
						>
							Clear
						</button>
					</div>
					<ul className="m-0 list-none p-0">
						{recent.map((q) => (
							<li key={q} className="flex items-center">
								<button
									type="button"
									className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-2 text-left text-sm hover:bg-muted"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => submit(q)}
								>
									<Clock className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{q}</span>
								</button>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove ${q} from recent searches`}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => setRecent(removeRecentSearch(q))}
								>
									<X />
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}
		</SearchFieldBase>
	);
};

export default SearchField;
