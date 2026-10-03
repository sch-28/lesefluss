import { RowLabel, SettingsRow } from "./settings-row";

const STEP_BTN =
	"inline-flex size-9 items-center justify-center rounded-md border-[1.5px] border-border font-semibold text-foreground text-sm leading-none transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30";

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
	const clamp = (n: number) => {
		const snapped = Math.round(n / step) * step;
		return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
	};
	return (
		<SettingsRow>
			<RowLabel title={label} hint={hint} />
			<div className="flex items-center gap-3">
				<span className="min-w-10 text-right text-muted-foreground text-sm tabular-nums">
					{display}
				</span>
				<div className="flex gap-1">
					<button
						type="button"
						className={STEP_BTN}
						disabled={value <= min}
						onClick={() => onChange(clamp(value - step))}
						aria-label={`Decrease ${label}`}
					>
						{decLabel}
					</button>
					<button
						type="button"
						className={STEP_BTN}
						disabled={value >= max}
						onClick={() => onChange(clamp(value + step))}
						aria-label={`Increase ${label}`}
					>
						{incLabel}
					</button>
				</div>
			</div>
		</SettingsRow>
	);
}
