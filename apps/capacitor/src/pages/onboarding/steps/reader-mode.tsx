import type React from "react";
import { ReaderModeCards } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";

const ReaderModeStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div className="onboarding-step">
			<h2 className="onboarding-step-title">Default reading mode</h2>
			<p className="onboarding-step-sub">Which view opens first when you tap a book?</p>
			<div className="onboarding-mode-picker-wrap">
				<ReaderModeCards
					value={settings.defaultReaderMode}
					onChange={(mode) => updateSetting("defaultReaderMode", mode)}
				/>
			</div>
		</div>
	);
};

export default ReaderModeStep;
