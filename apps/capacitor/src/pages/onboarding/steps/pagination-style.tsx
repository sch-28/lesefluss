import type React from "react";
import { ModeCards, PAGINATION_STYLE_OPTIONS } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";
import { StepHeader } from "../step-header";

const PaginationStyleStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div>
			<StepHeader title="Reading layout" description="How would you like pages to flow?" />
			<div className="mt-6">
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
