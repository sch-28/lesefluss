/**
 * RsvpSettingsForm: the RSVP settings controls (speed, punctuation, reading
 * mode, focal position, advanced ramp, reset). Shared between the dedicated
 * settings page (`/tabs/settings/rsvp`) and the in-reader sheet opened from
 * RsvpView. The `minimal` prop trims reader-mode + word-offset + reset for the
 * in-reader sheet and enables an "Open full settings" link.
 *
 * Does not render any page chrome (header, preview); callers wrap as appropriate.
 */

import {
	DEFAULT_SETTINGS,
	FOCAL_LETTER_COLOR_PRESETS,
	type HexColor,
	SETTING_CONSTRAINTS,
} from "@lesefluss/core";
import { Slider } from "@lesefluss/ui/slider";
import { cn } from "@lesefluss/ui/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { ModeCards, READER_MODE_OPTIONS, WpmPresetChips } from "../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";

const RSVP_DEFAULTS_PATCH = {
	wpm: DEFAULT_SETTINGS.WPM,
	delayComma: DEFAULT_SETTINGS.DELAY_COMMA,
	delayPeriod: DEFAULT_SETTINGS.DELAY_PERIOD,
	accelStart: DEFAULT_SETTINGS.ACCEL_START,
	accelRate: DEFAULT_SETTINGS.ACCEL_RATE,
	xOffset: DEFAULT_SETTINGS.X_OFFSET,
	focalLetterColor: DEFAULT_SETTINGS.FOCAL_LETTER_COLOR,
	wordOffset: DEFAULT_SETTINGS.WORD_OFFSET,
	defaultReaderMode: DEFAULT_SETTINGS.DEFAULT_READER_MODE,
};

const SectionHeader: React.FC<{ children: React.ReactNode; hint?: string }> = ({
	children,
	hint,
}) => (
	<div className="flex items-baseline gap-2 px-4 pt-5 pb-2">
		<h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{children}</h3>
		{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
	</div>
);

const Row: React.FC<{ children: React.ReactNode; className?: string }> = ({
	children,
	className,
}) => (
	<div
		className={cn(
			"flex min-h-12 items-center justify-between gap-3 border-border border-b px-4 py-2 last:border-b-0",
			className,
		)}
	>
		{children}
	</div>
);

interface StepperRowProps {
	label: string;
	hint?: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step: number;
	onChange: (next: number) => void;
}

const StepperRow: React.FC<StepperRowProps> = ({
	label,
	hint,
	value,
	display,
	min,
	max,
	step,
	onChange,
}) => {
	const clamp = (n: number) => {
		const snapped = Math.round(n / step) * step;
		return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
	};
	return (
		<Row>
			<div className="flex min-w-0 flex-col">
				<span className="text-foreground text-sm">{label}</span>
				{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
			</div>
			<div className="ap-settings-row">
				<span className="ap-settings-val">{display}</span>
				<div className="ap-row-buttons">
					<button
						type="button"
						className="ap-step-btn"
						disabled={value <= min}
						onClick={() => onChange(clamp(value - step))}
						aria-label={`Decrease ${label}`}
					>
						−
					</button>
					<button
						type="button"
						className="ap-step-btn"
						disabled={value >= max}
						onClick={() => onChange(clamp(value + step))}
						aria-label={`Increase ${label}`}
					>
						+
					</button>
				</div>
			</div>
		</Row>
	);
};

interface RsvpSettingsFormProps {
	/** When true, hides Reading Mode + Word offset (used in-reader where those aren't actionable). */
	minimal?: boolean;
	/** Optional handler rendered as a link at the bottom when `minimal` is set. */
	onOpenFullSettings?: () => void;
}

const RsvpSettingsForm: React.FC<RsvpSettingsFormProps> = ({
	minimal = false,
	onOpenFullSettings,
}) => {
	const { settings, updateSetting, replaceAll, isPending } = useAutoSaveSettings();
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [resetOpen, setResetOpen] = useState(false);

	if (isPending || !settings) {
		return (
			<div className="flex justify-center p-8">
				<Loader2 className="size-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<>
			<div className="flex flex-col">
				<SectionHeader>Speed</SectionHeader>

				<Row className="flex-col items-stretch gap-3 py-3">
					<WpmPresetChips value={settings.wpm} onChange={(wpm) => updateSetting("wpm", wpm)} />
				</Row>

				<Row className="flex-col items-stretch gap-2 py-3">
					<div className="flex items-baseline justify-between">
						<span className="text-foreground text-sm">Words per minute</span>
						<span className="font-medium text-foreground text-sm tabular-nums">{settings.wpm}</span>
					</div>
					<Slider
						min={SETTING_CONSTRAINTS.WPM.min}
						max={SETTING_CONSTRAINTS.WPM.max}
						step={SETTING_CONSTRAINTS.WPM.step}
						value={[settings.wpm]}
						onValueChange={(values) => updateSetting("wpm", values[0])}
					/>
				</Row>

				<SectionHeader>Punctuation</SectionHeader>

				<StepperRow
					label="Comma delay"
					hint="(, ; :)"
					value={settings.delayComma}
					display={`${settings.delayComma.toFixed(1)}×`}
					min={SETTING_CONSTRAINTS.DELAY_COMMA.min}
					max={SETTING_CONSTRAINTS.DELAY_COMMA.max}
					step={SETTING_CONSTRAINTS.DELAY_COMMA.step}
					onChange={(v) => updateSetting("delayComma", v)}
				/>

				<StepperRow
					label="Period delay"
					hint="(. ! ?)"
					value={settings.delayPeriod}
					display={`${settings.delayPeriod.toFixed(1)}×`}
					min={SETTING_CONSTRAINTS.DELAY_PERIOD.min}
					max={SETTING_CONSTRAINTS.DELAY_PERIOD.max}
					step={SETTING_CONSTRAINTS.DELAY_PERIOD.step}
					onChange={(v) => updateSetting("delayPeriod", v)}
				/>

				{!minimal && (
					<>
						<SectionHeader hint="(when opening a book)">Reading Mode</SectionHeader>
						<Row className="py-3">
							<ModeCards
								options={READER_MODE_OPTIONS}
								value={settings.defaultReaderMode as "scroll" | "rsvp"}
								onChange={(mode) => updateSetting("defaultReaderMode", mode)}
							/>
						</Row>
					</>
				)}

				<StepperRow
					label="Focal position"
					value={settings.xOffset}
					display={`${settings.xOffset}%`}
					min={SETTING_CONSTRAINTS.X_OFFSET.min}
					max={SETTING_CONSTRAINTS.X_OFFSET.max}
					step={SETTING_CONSTRAINTS.X_OFFSET.step}
					onChange={(v) => updateSetting("xOffset", v)}
				/>

				<Row>
					<div className="flex min-w-0 flex-col">
						<span className="text-foreground text-sm">Focal letter color</span>
						<span className="text-muted-foreground text-xs tabular-nums">
							{settings.focalLetterColor}
						</span>
					</div>
					<div className="flex gap-1.5">
						{FOCAL_LETTER_COLOR_PRESETS.map((color) => {
							const isActive = settings.focalLetterColor.toLowerCase() === color;
							return (
								<button
									key={color}
									type="button"
									className={cn(
										"size-6 rounded-full border-2 transition-transform",
										isActive ? "scale-110 border-foreground" : "border-border",
									)}
									style={{ background: color }}
									onClick={() => updateSetting("focalLetterColor", color as HexColor)}
									aria-label={`Set focal letter color to ${color}`}
								/>
							);
						})}
					</div>
				</Row>

				<button
					type="button"
					className="mt-2 flex items-center justify-between border-border border-b px-4 py-3 text-left transition-colors hover:bg-muted"
					onClick={() => setAdvancedOpen((o) => !o)}
					aria-expanded={advancedOpen}
				>
					<span className="font-medium text-foreground text-sm">Advanced</span>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform",
							advancedOpen && "rotate-180",
						)}
					/>
				</button>

				{advancedOpen && (
					<>
						<StepperRow
							label="Start speed"
							hint="(ease-in multiplier)"
							value={settings.accelStart}
							display={`${settings.accelStart.toFixed(1)}×`}
							min={SETTING_CONSTRAINTS.ACCEL_START.min}
							max={SETTING_CONSTRAINTS.ACCEL_START.max}
							step={SETTING_CONSTRAINTS.ACCEL_START.step}
							onChange={(v) => updateSetting("accelStart", v)}
						/>
						<StepperRow
							label="Acceleration rate"
							hint="(ramp to full speed)"
							value={settings.accelRate}
							display={settings.accelRate.toFixed(2)}
							min={SETTING_CONSTRAINTS.ACCEL_RATE.min}
							max={SETTING_CONSTRAINTS.ACCEL_RATE.max}
							step={SETTING_CONSTRAINTS.ACCEL_RATE.step}
							onChange={(v) => updateSetting("accelRate", v)}
						/>
						{!minimal && (
							<StepperRow
								label="Word offset"
								hint="(rewind on resume)"
								value={settings.wordOffset}
								display={`${settings.wordOffset}`}
								min={SETTING_CONSTRAINTS.WORD_OFFSET.min}
								max={SETTING_CONSTRAINTS.WORD_OFFSET.max}
								step={SETTING_CONSTRAINTS.WORD_OFFSET.step}
								onChange={(v) => updateSetting("wordOffset", v)}
							/>
						)}
					</>
				)}
			</div>

			<div className="flex justify-center px-4 pt-6 pb-2">
				{!minimal && (
					<button
						type="button"
						className="text-destructive text-sm transition-opacity hover:opacity-70"
						onClick={() => setResetOpen(true)}
					>
						Reset RSVP settings
					</button>
				)}
				{minimal && onOpenFullSettings && (
					<button
						type="button"
						className="text-primary text-sm underline-offset-4 hover:underline"
						onClick={onOpenFullSettings}
					>
						Open full RSVP settings
					</button>
				)}
			</div>

			<ConfirmDialog
				open={resetOpen}
				onOpenChange={setResetOpen}
				title="Reset RSVP settings?"
				description="All RSVP settings will return to their defaults. Reader appearance is untouched."
				confirmLabel="Reset"
				destructive
				onConfirm={() => {
					void replaceAll(RSVP_DEFAULTS_PATCH);
				}}
			/>
		</>
	);
};

export default RsvpSettingsForm;
