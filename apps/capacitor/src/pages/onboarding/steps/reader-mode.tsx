import type React from "react";
import { ModeCards, READER_MODE_OPTIONS } from "../../../components/rsvp-pickers";
import { useAutoSaveSettings } from "../../../hooks/use-auto-save-settings";
import { StepHeader } from "../step-header";

const ReaderModeStep: React.FC = () => {
	const { settings, updateSetting } = useAutoSaveSettings();
	if (!settings) return null;

	return (
		<div>
			<StepHeader
				title="Default reading mode"
				description="Which view opens first when you tap a book?"
			/>
			<div className="mt-6">
				<ModeCards
					options={READER_MODE_OPTIONS}
					value={settings.defaultReaderMode}
					onChange={(mode) => updateSetting("defaultReaderMode", mode)}
				/>
			</div>
		</div>
	);
};

export default ReaderModeStep;
