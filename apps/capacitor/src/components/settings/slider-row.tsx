import { Slider } from "@lesefluss/ui/slider";
import { SettingsRow } from "./settings-row";

export function SliderRow({
	label,
	value,
	display,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step: number;
	onChange: (next: number) => void;
}) {
	return (
		<SettingsRow stacked className="gap-2">
			<div className="flex items-baseline justify-between">
				<span className="text-foreground text-sm">{label}</span>
				<span className="font-medium text-foreground text-sm tabular-nums">{display}</span>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={[value]}
				onValueChange={(v) => onChange(v[0] ?? value)}
			/>
		</SettingsRow>
	);
}
