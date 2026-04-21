import {
	IonAlert,
	IonBackButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonListHeader,
	IonNote,
	IonPage,
	IonRange,
	IonSpinner,
	IonTitle,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import { DEFAULT_SETTINGS, SETTING_CONSTRAINTS } from "@lesefluss/rsvp-core";
import { chevronDown } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import RsvpPreview from "./rsvp-preview";

const CHIP_CONTAINER_STYLE: React.CSSProperties = { flex: 1, padding: "8px 0" };

const READER_MODES: Array<{ value: "scroll" | "rsvp"; label: string }> = [
	{ value: "scroll", label: "Reader" },
	{ value: "rsvp", label: "RSVP" },
];

const WPM_PRESETS: Array<{ value: number; label: string }> = [
	{ value: 250, label: "Slow" },
	{ value: 350, label: "Normal" },
	{ value: 500, label: "Fast" },
];

/** RSVP-scoped subset of DEFAULT_SETTINGS for the reset button. Reader-appearance fields are untouched. */
const RSVP_DEFAULTS_PATCH = {
	wpm: DEFAULT_SETTINGS.WPM,
	delayComma: DEFAULT_SETTINGS.DELAY_COMMA,
	delayPeriod: DEFAULT_SETTINGS.DELAY_PERIOD,
	accelStart: DEFAULT_SETTINGS.ACCEL_START,
	accelRate: DEFAULT_SETTINGS.ACCEL_RATE,
	xOffset: DEFAULT_SETTINGS.X_OFFSET,
	wordOffset: DEFAULT_SETTINGS.WORD_OFFSET,
	haptics: DEFAULT_SETTINGS.HAPTICS,
	defaultReaderMode: DEFAULT_SETTINGS.DEFAULT_READER_MODE,
};

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
	// Round to the step grid to keep floating-point display clean.
	const clamp = (n: number) => {
		const snapped = Math.round(n / step) * step;
		return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
	};
	return (
		<IonItem>
			<IonLabel>
				{label}
				{hint && <IonNote className="ion-padding-start">{hint}</IonNote>}
			</IonLabel>
			<div slot="end" className="ap-settings-row">
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
		</IonItem>
	);
};

const RSVPSettings: React.FC = () => {
	const { settings, updateSetting, replaceAll, isPending } = useAutoSaveSettings();
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [resetOpen, setResetOpen] = useState(false);

	if (isPending || !settings) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<IonSpinner />
				</IonContent>
			</IonPage>
		);
	}

	const previewSettings = {
		wpm: settings.wpm,
		delayComma: settings.delayComma,
		delayPeriod: settings.delayPeriod,
		accelStart: settings.accelStart,
		accelRate: settings.accelRate,
		xOffset: settings.xOffset,
	};

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>RSVP</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<div className="content-container">
					<RsvpPreview settings={previewSettings} />

					<IonList>
						{/* ── Speed ── */}
						<IonListHeader>
							<IonLabel>Speed</IonLabel>
						</IonListHeader>

						<IonItem>
							<div className="ap-chips" style={CHIP_CONTAINER_STYLE}>
								{WPM_PRESETS.map((p) => (
									<button
										key={p.value}
										type="button"
										className={
											settings.wpm === p.value ? "ap-chip ap-chip--active" : "ap-chip"
										}
										onClick={() => updateSetting("wpm", p.value)}
									>
										{p.label} {p.value}
									</button>
								))}
							</div>
						</IonItem>

						<IonItem>
							<IonLabel position="stacked">Words per minute</IonLabel>
							<IonRange
								min={SETTING_CONSTRAINTS.WPM.min}
								max={SETTING_CONSTRAINTS.WPM.max}
								step={SETTING_CONSTRAINTS.WPM.step}
								value={settings.wpm}
								onIonChange={(e) => updateSetting("wpm", e.detail.value as number)}
								pin
								pinFormatter={(value: number) => `${value}`}
							>
								<IonNote slot="start">{SETTING_CONSTRAINTS.WPM.min}</IonNote>
								<IonNote slot="end">{settings.wpm}</IonNote>
							</IonRange>
						</IonItem>

						<IonItem>
							<IonLabel>
								Haptics
								<IonNote className="ion-padding-start">(vibrate on controls)</IonNote>
							</IonLabel>
							<IonToggle
								slot="end"
								checked={settings.haptics}
								onIonChange={(e) => updateSetting("haptics", e.detail.checked)}
							/>
						</IonItem>

						{/* ── Punctuation ── */}
						<IonListHeader>
							<IonLabel>Punctuation</IonLabel>
						</IonListHeader>

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

						{/* ── Reading mode ── */}
						<IonListHeader>
							<IonLabel>Reading Mode</IonLabel>
						</IonListHeader>

						<IonItem>
							<IonLabel position="stacked">
								Default mode
								<IonNote className="ion-padding-start">(when opening a book)</IonNote>
							</IonLabel>
							<div className="ap-chips" style={CHIP_CONTAINER_STYLE}>
								{READER_MODES.map((m) => (
									<button
										key={m.value}
										type="button"
										className={
											settings.defaultReaderMode === m.value
												? "ap-chip ap-chip--active"
												: "ap-chip"
										}
										onClick={() => updateSetting("defaultReaderMode", m.value)}
									>
										{m.label}
									</button>
								))}
							</div>
						</IonItem>

						{/* ── Advanced (collapsible) ── */}
						<button
							type="button"
							className="rsvp-advanced-toggle"
							onClick={() => setAdvancedOpen((o) => !o)}
							aria-expanded={advancedOpen}
						>
							<span>Advanced</span>
							<IonIcon
								icon={chevronDown}
								className={advancedOpen ? "rsvp-advanced-chevron rsvp-advanced-chevron--open" : "rsvp-advanced-chevron"}
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

								<StepperRow
									label="Focal position"
									hint="(horizontal %)"
									value={settings.xOffset}
									display={`${settings.xOffset}%`}
									min={SETTING_CONSTRAINTS.X_OFFSET.min}
									max={SETTING_CONSTRAINTS.X_OFFSET.max}
									step={SETTING_CONSTRAINTS.X_OFFSET.step}
									onChange={(v) => updateSetting("xOffset", v)}
								/>
							</>
						)}

					</IonList>

					<div className="rsvp-reset-wrap">
						<button
							type="button"
							className="rsvp-reset-btn"
							onClick={() => setResetOpen(true)}
						>
							Reset RSVP settings
						</button>
					</div>
				</div>

				<IonAlert
					isOpen={resetOpen}
					onDidDismiss={() => setResetOpen(false)}
					header="Reset RSVP settings?"
					message="All RSVP settings will return to their defaults. Reader appearance is untouched."
					buttons={[
						{ text: "Cancel", role: "cancel" },
						{
							text: "Reset",
							role: "destructive",
							handler: () => {
								void replaceAll(RSVP_DEFAULTS_PATCH);
							},
						},
					]}
				/>
			</IonContent>
		</IonPage>
	);
};

export default RSVPSettings;
