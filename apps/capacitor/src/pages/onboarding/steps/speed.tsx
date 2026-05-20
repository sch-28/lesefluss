import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { Slider } from "@lesefluss/ui/slider";
import type React from "react";
import { WpmPresetChips } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";
import RsvpPreview from "../../settings/rsvp-preview";

const SpeedStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div>
			<h2 className="font-semibold text-2xl tracking-tight">Reading speed</h2>
			<p className="mt-2 text-muted-foreground">
				Words flash one at a time. Find a pace that feels brisk but readable.
			</p>

			<div className="mt-6">
				<RsvpPreview settings={settings} />
			</div>

			<div className="mt-6">
				<WpmPresetChips value={settings.wpm} onChange={(wpm) => updateSetting("wpm", wpm)} />
			</div>

			<div className="mt-6 space-y-3">
				<div className="text-center font-semibold text-3xl tabular-nums">{settings.wpm} WPM</div>
				<Slider
					min={SETTING_CONSTRAINTS.WPM.min}
					max={SETTING_CONSTRAINTS.WPM.max}
					step={SETTING_CONSTRAINTS.WPM.step}
					value={[settings.wpm]}
					onValueChange={(v) => updateSetting("wpm", v[0] ?? settings.wpm)}
				/>
				<div className="flex justify-between text-muted-foreground text-xs">
					<span>Beginner</span>
					<span>Fast</span>
				</div>
			</div>
		</div>
	);
};

export default SpeedStep;
