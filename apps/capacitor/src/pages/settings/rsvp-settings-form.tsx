/**
 * RsvpSettingsForm: the RSVP settings controls (speed, punctuation, focal
 * point, advanced ramp, reset). Shared between the dedicated settings page
 * (`/tabs/settings/rsvp`) and the in-reader sheet opened from RsvpView. The
 * `minimal` prop trims word-offset + reset for the in-reader sheet and enables
 * an "Open full settings" link.
 *
 * Does not render any page chrome (header, preview); callers wrap as appropriate.
 */

import {
	DEFAULT_SETTINGS,
	FOCAL_LETTER_COLOR_PRESETS,
	type HexColor,
	SETTING_CONSTRAINTS,
} from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { WpmPresetChips } from "../../components/rsvp-pickers";
import { RowLabel, SettingsRow } from "../../components/settings/settings-row";
import { SettingsSection } from "../../components/settings/settings-section";
import { SliderRow } from "../../components/settings/slider-row";
import { StepperRow } from "../../components/settings/stepper-row";
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
};

interface RsvpSettingsFormProps {
	/** When true, hides Word offset and reset (used in-reader where those aren't actionable). */
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
			<SettingsSection title="Speed">
				<SettingsRow stacked>
					<WpmPresetChips value={settings.wpm} onChange={(wpm) => updateSetting("wpm", wpm)} />
				</SettingsRow>
				<SliderRow
					label="Words per minute"
					value={settings.wpm}
					display={`${settings.wpm}`}
					min={SETTING_CONSTRAINTS.WPM.min}
					max={SETTING_CONSTRAINTS.WPM.max}
					step={SETTING_CONSTRAINTS.WPM.step}
					onChange={(wpm) => updateSetting("wpm", wpm)}
				/>
			</SettingsSection>

			<SettingsSection title="Punctuation">
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
			</SettingsSection>

			<SettingsSection title="Focal point">
				<StepperRow
					label="Focal position"
					value={settings.xOffset}
					display={`${settings.xOffset}%`}
					min={SETTING_CONSTRAINTS.X_OFFSET.min}
					max={SETTING_CONSTRAINTS.X_OFFSET.max}
					step={SETTING_CONSTRAINTS.X_OFFSET.step}
					onChange={(v) => updateSetting("xOffset", v)}
				/>
				<SettingsRow>
					<RowLabel
						title="Focal letter color"
						hint={<span className="tabular-nums">{settings.focalLetterColor}</span>}
					/>
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
				</SettingsRow>
			</SettingsSection>

			<SettingsSection>
				<button
					type="button"
					className="mt-2 flex min-h-12 items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted"
					onClick={() => setAdvancedOpen((o) => !o)}
					aria-expanded={advancedOpen}
				>
					<span className="font-semibold text-foreground text-sm uppercase tracking-wide">
						Advanced
					</span>
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
			</SettingsSection>

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
