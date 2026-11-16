import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * The one number stepper: a bordered pill with 44px − and + buttons. The
 * caller owns the stepping, so uneven steps (wpm, font sizes) fit.
 */
export function Stepper({
	value,
	onDecrement,
	onIncrement,
	canDecrement = true,
	canIncrement = true,
	label,
	decrementLabel = `Decrease ${label.toLowerCase()}`,
	incrementLabel = `Increase ${label.toLowerCase()}`,
	className,
	valueClassName,
	"data-testid": testId,
}: {
	value: React.ReactNode;
	onDecrement: () => void;
	onIncrement: () => void;
	canDecrement?: boolean;
	canIncrement?: boolean;
	/** What the value is, for the group and the default button names. */
	label: string;
	decrementLabel?: string;
	incrementLabel?: string;
	className?: string;
	valueClassName?: string;
	"data-testid"?: string;
}) {
	const button =
		"inline-flex size-11 shrink-0 items-center justify-center rounded-full font-semibold text-lg leading-none outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-transparent";
	// aria-disabled, not disabled: a disabled button drops the focus it holds.
	return (
		<fieldset
			aria-label={label}
			data-slot="stepper"
			data-testid={testId}
			className={cn(
				"m-0 inline-flex min-w-0 items-center rounded-full border border-border p-0",
				className,
			)}
		>
			<button
				type="button"
				className={button}
				aria-label={decrementLabel}
				aria-disabled={!canDecrement}
				onClick={() => {
					if (canDecrement) onDecrement();
				}}
			>
				−
			</button>
			<span
				className={cn("min-w-16 text-center font-semibold tabular-nums", valueClassName)}
				aria-live="polite"
			>
				{value}
			</span>
			<button
				type="button"
				className={button}
				aria-label={incrementLabel}
				aria-disabled={!canIncrement}
				onClick={() => {
					if (canIncrement) onIncrement();
				}}
			>
				+
			</button>
		</fieldset>
	);
}
