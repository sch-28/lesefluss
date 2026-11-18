import { Search, X } from "lucide-react";
import type * as React from "react";
import { useRef } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input, InputHitArea } from "./input";

type SearchFieldProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
	value: string;
	onValueChange: (value: string) => void;
	/** Replaces the default clear, which empties the value. */
	onClear?: () => void;
	/** A control before the clear button, such as a help popover. */
	trailing?: React.ReactNode;
	/** Muted text at the end, such as a match count. */
	hint?: React.ReactNode;
	/** Overlays anchored to the field, such as a suggestion list. */
	children?: React.ReactNode;
	className?: string;
	inputClassName?: string;
};

/**
 * The one search field: a 32px input inside a 44px touch hit area, the search glyph at the
 * start and a clear button at the end once it has a value. 16px text on a phone, so iOS does
 * not zoom on focus.
 */
function SearchField({
	value,
	onValueChange,
	onClear,
	trailing,
	hint,
	children,
	className,
	inputClassName,
	ref,
	...inputProps
}: SearchFieldProps) {
	const ownRef = useRef<HTMLInputElement | null>(null);
	const setRef = (el: HTMLInputElement | null) => {
		ownRef.current = el;
		if (typeof ref === "function") ref(el);
		else if (ref) ref.current = el;
	};
	const hasClear = value !== "";
	// A hint (a count such as "3 of 12") takes about two buttons' width.
	const endItems = (hint != null ? 2 : 0) + (trailing ? 1 : 0) + (hasClear ? 1 : 0);

	return (
		<div data-slot="search-field" className={cn("relative", className)}>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<InputHitArea>
				<Input
					ref={setRef}
					type="search"
					inputMode="search"
					enterKeyHint="search"
					value={value}
					onChange={(e) => onValueChange(e.target.value)}
					className={cn(
						"pl-9 [&::-webkit-search-cancel-button]:appearance-none",
						endItems >= 3 ? "pr-24" : endItems === 2 ? "pr-16" : "pr-9",
						inputClassName,
					)}
					{...inputProps}
				/>
			</InputHitArea>
			<div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
				{hint != null && (
					<span className="pointer-events-none px-1 text-muted-foreground text-xs tabular-nums">
						{hint}
					</span>
				)}
				{trailing}
				{hasClear && (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Clear search"
						onClick={() => {
							if (onClear) onClear();
							else onValueChange("");
							ownRef.current?.focus();
						}}
					>
						<X />
					</Button>
				)}
			</div>
			{children}
		</div>
	);
}

export type { SearchFieldProps };
export { SearchField };
