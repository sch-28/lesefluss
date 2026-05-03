import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import type { SettingsSnapshot } from "../../services/reader-bus";
import type { Colors } from "../theme";
import { Button, Frame, IconBack } from "../ui";

interface Props {
	colors: Colors;
	settings: SettingsSnapshot | null;
	onChange: (key: string, value: unknown) => void;
	onBack: () => void;
}

interface SliderRow {
	label: string;
	key: keyof SettingsSnapshot;
	min: number;
	max: number;
	step: number;
	format: (n: number) => string;
}

// Pulled from SETTING_CONSTRAINTS in @lesefluss/core so the secondary stays
// in lockstep with the primary's bounds — no magic numbers duplicated here.
const ROWS: SliderRow[] = [
	{
		label: "Speed",
		key: "wpm",
		min: SETTING_CONSTRAINTS.WPM.min,
		max: SETTING_CONSTRAINTS.WPM.max,
		step: SETTING_CONSTRAINTS.WPM.step,
		format: (n) => `${n} wpm`,
	},
	{
		label: "Comma pause",
		key: "delayComma",
		min: SETTING_CONSTRAINTS.DELAY_COMMA.min,
		max: SETTING_CONSTRAINTS.DELAY_COMMA.max,
		step: SETTING_CONSTRAINTS.DELAY_COMMA.step,
		format: (n) => `${n.toFixed(1)}×`,
	},
	{
		label: "Period pause",
		key: "delayPeriod",
		min: SETTING_CONSTRAINTS.DELAY_PERIOD.min,
		max: SETTING_CONSTRAINTS.DELAY_PERIOD.max,
		step: SETTING_CONSTRAINTS.DELAY_PERIOD.step,
		format: (n) => `${n.toFixed(1)}×`,
	},
	{
		label: "Acceleration start",
		key: "accelStart",
		min: SETTING_CONSTRAINTS.ACCEL_START.min,
		max: SETTING_CONSTRAINTS.ACCEL_START.max,
		step: SETTING_CONSTRAINTS.ACCEL_START.step,
		format: (n) => `${n.toFixed(1)}×`,
	},
	{
		label: "Acceleration rate",
		key: "accelRate",
		min: SETTING_CONSTRAINTS.ACCEL_RATE.min,
		max: SETTING_CONSTRAINTS.ACCEL_RATE.max,
		step: SETTING_CONSTRAINTS.ACCEL_RATE.step,
		format: (n) => `${n.toFixed(2)}`,
	},
];

export function SettingsView({ colors, settings, onChange, onBack }: Props) {
	return (
		<Frame colors={colors} align="stretch">
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<Button colors={colors} variant="ghost" onClick={onBack} aria-label="Back">
					<IconBack />
				</Button>
				<div style={{ fontSize: 22, color: colors.heading, letterSpacing: 0.5 }}>Settings</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 24 }}>
				{ROWS.map((row) => {
					const raw = settings?.[row.key] ?? row.min;
					const value = typeof raw === "number" ? raw : row.min;
					return (
						<div key={String(row.key)}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									fontSize: 14,
									color: colors.muted,
									marginBottom: 8,
								}}
							>
								<span>{row.label}</span>
								<span>{row.format(value)}</span>
							</div>
							<input
								type="range"
								min={row.min}
								max={row.max}
								step={row.step}
								value={value}
								onChange={(e) => onChange(String(row.key), Number(e.target.value))}
								style={{ width: "100%", accentColor: colors.progressFill }}
							/>
						</div>
					);
				})}
			</div>
		</Frame>
	);
}
