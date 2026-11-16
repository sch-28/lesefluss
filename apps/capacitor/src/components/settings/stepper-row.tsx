import { Stepper } from "@lesefluss/ui/stepper";
import { RowLabel, SettingsRow } from "./settings-row";

export function StepperRow({
	label,
	hint,
	value,
	display,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	hint?: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step: number;
	onChange: (next: number) => void;
}) {
	// Snapped to the grid that starts at `min`, which need not be a multiple of `step`.
	const clamp = (n: number) => {
		const snapped = min + Math.round((n - min) / step) * step;
		return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
	};
	return (
		<SettingsRow>
			<RowLabel title={label} hint={hint} />
			<Stepper
				className="ml-auto"
				label={label}
				decrementLabel={`Decrease ${label}`}
				incrementLabel={`Increase ${label}`}
				value={display}
				valueClassName="text-sm"
				canDecrement={value > min}
				canIncrement={value < max}
				onDecrement={() => onChange(clamp(value - step))}
				onIncrement={() => onChange(clamp(value + step))}
			/>
		</SettingsRow>
	);
}
