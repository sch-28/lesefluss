import type React from "react";
import { ModeCards, PAGINATION_STYLE_OPTIONS } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";

const PaginationStyleStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div className="onboarding-step">
			<h2 className="onboarding-step-title">Reading layout</h2>
			<p className="onboarding-step-sub">How would you like pages to flow?</p>
			<div className="onboarding-mode-picker-wrap">
				<ModeCards
					options={PAGINATION_STYLE_OPTIONS}
					value={settings.paginationStyle}
					onChange={(style) => updateSetting("paginationStyle", style)}
				/>
			</div>
		</div>
	);
};

export default PaginationStyleStep;
