import { IonRange } from "@ionic/react";
import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import type React from "react";
import { WpmPresetChips } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";
import RsvpPreview from "../../settings/rsvp-preview";

const SpeedStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div className="onboarding-step">
			<h2 className="onboarding-step-title">Reading speed</h2>
			<p className="onboarding-step-sub">
				Words flash one at a time. Find a pace that feels brisk but readable.
			</p>
			<div className="onboarding-preview-wrap">
				<RsvpPreview settings={settings} />
			</div>
			<div className="onboarding-wpm-presets">
				<WpmPresetChips value={settings.wpm} onChange={(wpm) => updateSetting("wpm", wpm)} />
			</div>
			<div className="onboarding-wpm-readout">{settings.wpm} WPM</div>
			<IonRange
				min={SETTING_CONSTRAINTS.WPM.min}
				max={SETTING_CONSTRAINTS.WPM.max}
				step={SETTING_CONSTRAINTS.WPM.step}
				value={settings.wpm}
				onIonInput={(e) => updateSetting("wpm", e.detail.value as number)}
				pin={false}
			/>
			<div className="onboarding-range-hints">
				<span>Beginner</span>
				<span>Fast</span>
			</div>
		</div>
	);
};

export default SpeedStep;
