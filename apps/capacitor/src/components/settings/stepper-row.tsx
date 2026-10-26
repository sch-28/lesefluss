import { RowLabel, SettingsRow } from "./settings-row";

// The ::before stretches the touch target to 44px without changing the look;
// the gap keeps neighbouring targets from overlapping.
const STEP_BTN =
	"relative inline-flex size-9 items-center justify-center rounded-md border-[1.5px] border-border font-semibold text-foreground text-sm leading-none transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-transparent";

export function StepperRow({
	label,
	hint,
	value,
	display,
	min,
	max,
	step,
	onChange,
	decLabel = "−",
	incLabel = "+",
}: {
	label: string;
	hint?: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step: number;
	onChange: (next: number) => void;
	decLabel?: string;
	incLabel?: string;
}) {
	// Snapped to the grid that starts at `min`, which need not be a multiple of `step`.
	const clamp = (n: number) => {
		const snapped = min + Math.round((n - min) / step) * step;
		return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
	};
	const atMin = value <= min;
	const atMax = value >= max;
	return (
		<SettingsRow>
			<RowLabel title={label} hint={hint} />
			<div className="flex items-center gap-3">
				<span
					className="min-w-10 text-right text-muted-foreground text-sm tabular-nums"
					aria-live="polite"
				>
					{display}
				</span>
				<div className="flex gap-2">
					<button
						type="button"
						className={STEP_BTN}
						aria-disabled={atMin}
						onClick={() => {
							if (!atMin) onChange(clamp(value - step));
						}}
						aria-label={`Decrease ${label}`}
					>
						{decLabel}
					</button>
					<button
						type="button"
						className={STEP_BTN}
						aria-disabled={atMax}
						onClick={() => {
							if (!atMax) onChange(clamp(value + step));
						}}
						aria-label={`Increase ${label}`}
					>
						{incLabel}
					</button>
				</div>
			</div>
		</SettingsRow>
	);
}
